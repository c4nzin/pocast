export const CATALOG_PATTERNS = {
  IMPORT_FEED: 'catalog.podcast.import',
  LIST_PODCASTS: 'catalog.podcast.list',
  GET_PODCAST: 'catalog.podcast.get',
  LIST_EPISODES: 'catalog.episode.list',
} as const;

export const CATALOG_EVENTS = {
  FEED_REFRESH: 'catalog.feed.refresh',
} as const;

export interface FeedRefreshJob {
  readonly podcastId: string;
}
