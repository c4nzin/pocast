import { Prisma } from '../../generated/prisma/client';
import { ParsedEpisode } from './feed-parser';

export const EPISODE_INSERT_CHUNK = 500;
export const RECENT_EPISODES_TO_UPDATE = 50;

type Tx = Prisma.TransactionClient;

export interface EpisodeSyncResult {
  readonly inserted: number;
  readonly updated: number;
  readonly episodeCount: number;
  readonly latestEpisodeAt: Date | null;
}

function mutableFields(episode: ParsedEpisode) {
  return {
    title: episode.title,
    description: episode.description,
    imageUrl: episode.imageUrl,
    durationSeconds: episode.durationSeconds,
    season: episode.season,
    episodeNumber: episode.episodeNumber,
    episodeType: episode.episodeType,
    explicit: episode.explicit,
    mediaUrl: episode.mediaUrl,
    mediaMimeType: episode.mediaMimeType,
    mediaSizeBytes: episode.mediaSizeBytes,
    mediaType: episode.mediaType,
  } as const;
}

export async function syncEpisodes(
  tx: Tx,
  podcastId: string,
  episodes: readonly ParsedEpisode[],
  fetchedAt: Date,
): Promise<EpisodeSyncResult> {
  const existing = await tx.episode.findMany({
    where: { podcastId },
    select: { guid: true },
  });
  const known = new Set(existing.map((e) => e.guid));

  const fresh = episodes.filter((e) => !known.has(e.guid));
  for (let i = 0; i < fresh.length; i += EPISODE_INSERT_CHUNK) {
    await tx.episode.createMany({
      data: fresh.slice(i, i + EPISODE_INSERT_CHUNK).map((episode) => ({
        ...mutableFields(episode),
        podcastId,
        guid: episode.guid,
        mediaKind: 'EXTERNAL_URL' as const,
        publishedAt: episode.publishedAt ?? fetchedAt,
      })),
      skipDuplicates: true,
    });
  }

  const recentKnown = episodes
    .slice(0, RECENT_EPISODES_TO_UPDATE)
    .filter((e) => known.has(e.guid));
  for (const episode of recentKnown) {
    await tx.episode.update({
      where: { podcastId_guid: { podcastId, guid: episode.guid } },
      data: {
        ...mutableFields(episode),
        ...(episode.publishedAt ? { publishedAt: episode.publishedAt } : {}),
      },
    });
  }

  const stats = await tx.episode.aggregate({
    where: { podcastId },
    _count: { _all: true },
    _max: { publishedAt: true },
  });
  return {
    inserted: fresh.length,
    updated: recentKnown.length,
    episodeCount: stats._count._all,
    latestEpisodeAt: stats._max.publishedAt,
  };
}
