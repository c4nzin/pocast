export const CREATOR_SERVICE = 'CREATOR_SERVICE';
export const CREATOR_QUEUE = 'creator_queue';

export const CREATOR_PATTERNS = {
  CREATE_SHOW: 'creator.show.create',
  UPDATE_SHOW: 'creator.show.update',
  GET_SHOW: 'creator.show.get',
  LIST_SHOWS: 'creator.show.list',
  REQUEST_ARTWORK_UPLOAD: 'creator.show.artwork.request',
  COMPLETE_ARTWORK_UPLOAD: 'creator.show.artwork.complete',
  CREATE_EPISODE: 'creator.episode.create',
  LIST_EPISODES: 'creator.episode.list',
  GET_EPISODE: 'creator.episode.get',
  PUBLISH_EPISODE: 'creator.episode.publish',
  REQUEST_UPLOAD: 'creator.media.upload.request',
  COMPLETE_UPLOAD: 'creator.media.upload.complete',
  GET_FEED: 'creator.feed.get',
} as const;

export const EPISODE_TYPES = ['FULL', 'TRAILER', 'BONUS'] as const;
export type CreatorEpisodeType = (typeof EPISODE_TYPES)[number];

export const AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
] as const;
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

export type PublishStatus = 'DRAFT' | 'PUBLISHED';

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
