import { Episode, PodcastDetail, PodcastSummary } from '@pocast/contracts';

export const PODCAST_SUMMARY_SELECT = {
  id: true,
  title: true,
  author: true,
  imageUrl: true,
  language: true,
  explicit: true,
  episodeCount: true,
  latestEpisodeAt: true,
} as const;

export const PODCAST_DETAIL_SELECT = {
  ...PODCAST_SUMMARY_SELECT,
  source: true,
  description: true,
  websiteUrl: true,
  categories: { select: { category: { select: { slug: true } } } },
} as const;

export const EPISODE_SELECT = {
  id: true,
  podcastId: true,
  title: true,
  description: true,
  imageUrl: true,
  publishedAt: true,
  durationSeconds: true,
  season: true,
  episodeNumber: true,
  episodeType: true,
  explicit: true,
  mediaUrl: true,
  mediaType: true,
  mediaMimeType: true,
  mediaSizeBytes: true,
} as const;

interface PodcastSummaryRow {
  id: string;
  title: string;
  author: string | null;
  imageUrl: string | null;
  language: string | null;
  explicit: boolean;
  episodeCount: number;
  latestEpisodeAt: Date | null;
}

interface PodcastDetailRow extends PodcastSummaryRow {
  source: 'RSS' | 'HOSTED';
  description: string | null;
  websiteUrl: string | null;
  categories: { category: { slug: string } }[];
}

interface EpisodeRow {
  id: string;
  podcastId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  durationSeconds: number | null;
  season: number | null;
  episodeNumber: number | null;
  episodeType: 'FULL' | 'TRAILER' | 'BONUS';
  explicit: boolean;
  mediaUrl: string;
  mediaType: 'AUDIO' | 'VIDEO';
  mediaMimeType: string | null;
  mediaSizeBytes: bigint | null;
}

export function toPodcastSummary(row: PodcastSummaryRow): PodcastSummary {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    imageUrl: row.imageUrl,
    language: row.language,
    explicit: row.explicit,
    episodeCount: row.episodeCount,
    latestEpisodeAt: row.latestEpisodeAt?.toISOString() ?? null,
  };
}

export function toPodcastDetail(row: PodcastDetailRow): PodcastDetail {
  return {
    ...toPodcastSummary(row),
    source: row.source,
    description: row.description,
    websiteUrl: row.websiteUrl,
    categories: row.categories.map((c) => c.category.slug),
  };
}

export function toEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    podcastId: row.podcastId,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt.toISOString(),
    durationSeconds: row.durationSeconds,
    season: row.season,
    episodeNumber: row.episodeNumber,
    episodeType: row.episodeType,
    explicit: row.explicit,
    media: {
      url: row.mediaUrl,
      type: row.mediaType,
      mimeType: row.mediaMimeType,
      sizeBytes:
        row.mediaSizeBytes === null ? null : Number(row.mediaSizeBytes),
    },
  };
}
