import { HttpStatus, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  Episode,
  ListEpisodesQueryDto,
  ListPodcastsQueryDto,
  Page,
  PAGE_DEFAULT_LIMIT,
  PodcastDetail,
  PodcastSummary,
  RpcErrorPayload,
} from '@pocast/contracts';
import { Prisma } from '../../generated/prisma/client';
import { CategoryRegistry } from '../categories/category-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EPISODE_SELECT,
  PODCAST_DETAIL_SELECT,
  PODCAST_SUMMARY_SELECT,
  toEpisode,
  toPodcastDetail,
  toPodcastSummary,
} from './catalog-mappers';
import { decodeCursor, toPage } from './cursor';

function notFound(what: string): RpcException {
  const payload: RpcErrorPayload = {
    statusCode: HttpStatus.NOT_FOUND,
    message: `${what} not found`,
  };
  return new RpcException(payload);
}

@Injectable()
export class CatalogQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryRegistry,
  ) {}

  async listPodcasts(
    query: ListPodcastsQueryDto,
  ): Promise<Page<PodcastSummary>> {
    const limit = query.limit ?? PAGE_DEFAULT_LIMIT;
    const cursor = decodeCursor(query.cursor);
    const categoryId = query.category
      ? this.categories.idFor(query.category)
      : null;
    if (query.category && categoryId === null) {
      return { items: [], nextCursor: null };
    }

    const where: Prisma.PodcastWhereInput = {
      status: 'ACTIVE',
      latestEpisodeAt: { not: null },
      ...(query.language ? { language: query.language } : {}),
      ...(categoryId !== null ? { categories: { some: { categoryId } } } : {}),
      ...(cursor
        ? {
            OR: [
              { latestEpisodeAt: { lt: cursor.at } },
              { latestEpisodeAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.podcast.findMany({
      where,
      orderBy: [{ latestEpisodeAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: PODCAST_SUMMARY_SELECT,
    });
    const page = toPage(rows, limit, (row) => ({
      at: row.latestEpisodeAt as Date,
      id: row.id,
    }));
    return {
      items: page.items.map(toPodcastSummary),
      nextCursor: page.nextCursor,
    };
  }

  async getPodcast(id: string): Promise<PodcastDetail> {
    const row = await this.prisma.podcast.findFirst({
      where: { id, status: 'ACTIVE' },
      select: PODCAST_DETAIL_SELECT,
    });
    if (!row) throw notFound(`Podcast ${id}`);
    return toPodcastDetail(row);
  }

  async listEpisodes(query: ListEpisodesQueryDto): Promise<Page<Episode>> {
    const limit = query.limit ?? PAGE_DEFAULT_LIMIT;
    const cursor = decodeCursor(query.cursor);
    const podcast = await this.prisma.podcast.findFirst({
      where: { id: query.podcastId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!podcast) throw notFound(`Podcast ${query.podcastId}`);

    const rows = await this.prisma.episode.findMany({
      where: {
        podcastId: query.podcastId,
        ...(cursor
          ? {
              OR: [
                { publishedAt: { lt: cursor.at } },
                { publishedAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: EPISODE_SELECT,
    });
    const page = toPage(rows, limit, (row) => ({
      at: row.publishedAt,
      id: row.id,
    }));
    return { items: page.items.map(toEpisode), nextCursor: page.nextCursor };
  }
}
