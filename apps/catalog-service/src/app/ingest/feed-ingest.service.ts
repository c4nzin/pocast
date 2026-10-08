import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type PodcastSource } from '../../generated/prisma/client';
import { CategoryRegistry } from '../categories/category-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { syncEpisodes } from './episode-sync';
import { FeedFetcher, FeedFetchError } from './feed-fetcher';
import { ParsedFeed, parseFeed } from './feed-parser';
import { normalizeFeedUrl } from './feed-url';
import {
  errorBackoffMs,
  HIDE_AFTER_CONSECUTIVE_ERRORS,
  refreshIntervalMs,
  withJitter,
} from './refresh-policy';

export type RefreshOutcome = 'updated' | 'unchanged' | 'failed' | 'skipped';

const LAST_ERROR_MAX_LENGTH = 500;
const PERSIST_TIMEOUT_MS = 30_000;
const UNIQUE_VIOLATION = 'P2002';

interface FetchMeta {
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly contentHash: string;
}

const REFRESH_SELECT = {
  id: true,
  source: true,
  status: true,
  feedUrl: true,
  feedEtag: true,
  feedLastModified: true,
  feedContentHash: true,
  consecutiveErrors: true,
  latestEpisodeAt: true,
} as const;

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === UNIQUE_VIOLATION;
}

function metadataOf(feed: ParsedFeed) {
  return {
    title: feed.title,
    author: feed.author,
    description: feed.description,
    imageUrl: feed.imageUrl,
    websiteUrl: feed.websiteUrl,
    language: feed.language,
    explicit: feed.explicit,
    ownerName: feed.ownerName,
    ownerEmail: feed.ownerEmail,
  } as const;
}

@Injectable()
export class FeedIngestService {
  private readonly logger = new Logger(FeedIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: FeedFetcher,
    private readonly categories: CategoryRegistry,
  ) {}

  async importFeed(rawUrl: string): Promise<string> {
    const feedUrl = normalizeFeedUrl(rawUrl);
    const existing = await this.findIdByFeedUrl(feedUrl);
    if (existing) return existing;

    const result = await this.fetcher.fetch(feedUrl, {
      etag: null,
      lastModified: null,
    });
    if (result.kind !== 'fetched') {
      throw new FeedFetchError(
        'Unexpected 304 for an unconditional request',
        true,
      );
    }
    const parsed = parseFeed(result.body);
    const canonicalUrl = result.movedPermanently
      ? normalizeFeedUrl(result.finalUrl)
      : feedUrl;
    const movedExisting =
      canonicalUrl !== feedUrl && (await this.findIdByFeedUrl(canonicalUrl));
    if (movedExisting) return movedExisting;

    try {
      return await this.createPodcast(canonicalUrl, parsed, {
        etag: result.etag,
        lastModified: result.lastModified,
        contentHash: sha256(result.body),
      });
    } catch (error: unknown) {
      const winner =
        isUniqueViolation(error) && (await this.findIdByFeedUrl(canonicalUrl));
      if (winner) return winner;
      throw error;
    }
  }

  async upsertHostedFeed(rawUrl: string, xml: string): Promise<string> {
    const feedUrl = normalizeFeedUrl(rawUrl);
    const parsed = parseFeed(xml);
    const meta = { etag: null, lastModified: null, contentHash: sha256(xml) };
    const existing = await this.prisma.podcast.findUnique({
      where: { feedUrl },
      select: { id: true, source: true, feedContentHash: true },
    });
    if (existing && existing.source !== 'HOSTED') {
      throw new Error(`Feed ${feedUrl} already belongs to an RSS podcast`);
    }
    if (existing?.feedContentHash === meta.contentHash) {
      return existing.id;
    }
    if (existing) {
      await this.updatePodcast(existing.id, parsed, meta);
      return existing.id;
    }
    try {
      return await this.createPodcast(feedUrl, parsed, meta, 'HOSTED');
    } catch (error: unknown) {
      const winner =
        isUniqueViolation(error) && (await this.findIdByFeedUrl(feedUrl));
      if (winner) return this.upsertHostedFeed(rawUrl, xml);
      throw error;
    }
  }

  async refreshFeed(podcastId: string): Promise<RefreshOutcome> {
    const podcast = await this.prisma.podcast.findUnique({
      where: { id: podcastId },
      select: REFRESH_SELECT,
    });
    if (
      !podcast?.feedUrl ||
      podcast.source !== 'RSS' ||
      podcast.status === 'BLOCKED'
    ) {
      return 'skipped';
    }

    try {
      const result = await this.fetcher.fetch(podcast.feedUrl, {
        etag: podcast.feedEtag,
        lastModified: podcast.feedLastModified,
      });
      if (result.kind === 'not-modified') {
        await this.markHealthy(podcast.id, podcast.latestEpisodeAt, null);
        return 'unchanged';
      }
      const meta = {
        etag: result.etag,
        lastModified: result.lastModified,
        contentHash: sha256(result.body),
      };
      if (meta.contentHash === podcast.feedContentHash) {
        await this.markHealthy(podcast.id, podcast.latestEpisodeAt, meta);
        return 'unchanged';
      }
      await this.updatePodcast(podcast.id, parseFeed(result.body), meta);
      return 'updated';
    } catch (error: unknown) {
      await this.markFailed(podcast.id, podcast.consecutiveErrors + 1, error);
      return 'failed';
    }
  }

  private async findIdByFeedUrl(feedUrl: string): Promise<string | null> {
    const row = await this.prisma.podcast.findUnique({
      where: { feedUrl },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async claimableGuid(
    guid: string | null,
    podcastId: string | null,
  ): Promise<string | null> {
    if (!guid) return null;
    const owner = await this.prisma.podcast.findUnique({
      where: { guid },
      select: { id: true },
    });
    if (owner && owner.id !== podcastId) {
      this.logger.warn(
        `podcast:guid ${guid} already belongs to ${owner.id}; ignoring`,
      );
      return null;
    }
    return guid;
  }

  private async createPodcast(
    feedUrl: string,
    feed: ParsedFeed,
    meta: FetchMeta,
    source: PodcastSource = 'RSS',
  ): Promise<string> {
    const guid = await this.claimableGuid(feed.guid, null);
    return this.prisma.$transaction(
      async (tx) => {
        const { id } = await tx.podcast.create({
          data: { ...metadataOf(feed), source, feedUrl, guid },
          select: { id: true },
        });
        await this.persistChildren(tx, id, feed, meta);
        return id;
      },
      { timeout: PERSIST_TIMEOUT_MS },
    );
  }

  private async updatePodcast(
    id: string,
    feed: ParsedFeed,
    meta: FetchMeta,
  ): Promise<void> {
    const guid = await this.claimableGuid(feed.guid, id);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.podcast.update({
          where: { id },
          data: { ...metadataOf(feed), ...(guid ? { guid } : {}) },
        });
        await this.persistChildren(tx, id, feed, meta);
      },
      { timeout: PERSIST_TIMEOUT_MS },
    );
  }

  private async persistChildren(
    tx: Prisma.TransactionClient,
    podcastId: string,
    feed: ParsedFeed,
    meta: FetchMeta,
  ): Promise<void> {
    const now = new Date();
    await tx.podcastCategory.deleteMany({ where: { podcastId } });
    await tx.podcastCategory.createMany({
      data: this.categories
        .idsFor(feed.categories)
        .map((categoryId) => ({ podcastId, categoryId })),
      skipDuplicates: true,
    });
    const sync = await syncEpisodes(tx, podcastId, feed.episodes, now);
    await tx.podcast.updateMany({
      where: { id: podcastId, status: { not: 'BLOCKED' } },
      data: {
        episodeCount: sync.episodeCount,
        latestEpisodeAt: sync.latestEpisodeAt,
        status: 'ACTIVE',
        ...this.healthyState(sync.latestEpisodeAt, meta, now),
      },
    });
    this.logger.debug(
      `Synced ${podcastId}: +${sync.inserted} new, ${sync.updated} refreshed`,
    );
  }

  private healthyState(
    latestEpisodeAt: Date | null,
    meta: FetchMeta | null,
    now: Date,
  ) {
    return {
      lastFetchedAt: now,
      nextFetchAt: new Date(
        now.getTime() + withJitter(refreshIntervalMs(latestEpisodeAt, now)),
      ),
      consecutiveErrors: 0,
      lastError: null,
      ...(meta
        ? {
            feedEtag: meta.etag,
            feedLastModified: meta.lastModified,
            feedContentHash: meta.contentHash,
          }
        : {}),
    };
  }

  private async markHealthy(
    id: string,
    latestEpisodeAt: Date | null,
    meta: FetchMeta | null,
  ) {
    await this.prisma.podcast.updateMany({
      where: { id, status: { not: 'BLOCKED' } },
      data: {
        ...this.healthyState(latestEpisodeAt, meta, new Date()),
        status: 'ACTIVE',
      },
    });
  }

  private async markFailed(
    id: string,
    consecutiveErrors: number,
    error: unknown,
  ): Promise<void> {
    const now = new Date();
    const gone = error instanceof FeedFetchError && error.gone;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Feed refresh failed for ${id} (#${consecutiveErrors}): ${message}`,
    );
    await this.prisma.podcast.updateMany({
      where: { id, status: { not: 'BLOCKED' } },
      data: {
        consecutiveErrors,
        lastError: message.slice(0, LAST_ERROR_MAX_LENGTH),
        lastFetchedAt: now,
        nextFetchAt: new Date(
          now.getTime() + withJitter(errorBackoffMs(consecutiveErrors)),
        ),
        ...(gone || consecutiveErrors >= HIDE_AFTER_CONSECUTIVE_ERRORS
          ? { status: 'HIDDEN' }
          : {}),
      },
    });
  }
}
