export const CATALOG_PATTERNS = {
  IMPORT_FEED: 'catalog.podcast.import',
  LIST_PODCASTS: 'catalog.podcast.list',
  SEARCH_PODCASTS: 'catalog.podcast.search',
  GET_PODCAST: 'catalog.podcast.get',
  LIST_EPISODES: 'catalog.episode.list',
  GET_EPISODE: 'catalog.episode.get',
  LIST_CATEGORIES: 'catalog.category.list',
} as const;

export const CATALOG_EVENTS = {
  FEED_REFRESH: 'catalog.feed.refresh',
  HOSTED_SYNC: 'catalog.hosted.sync',
} as const;

export interface FeedRefreshJob {
  readonly podcastId: string;
}

export interface HostedSyncJob {
  readonly showId: string;
  readonly feedUrl: string;
}
