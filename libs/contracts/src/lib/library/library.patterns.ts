export const LIBRARY_SERVICE = 'LIBRARY_SERVICE';
export const LIBRARY_QUEUE = 'library_queue';

export const LIBRARY_PATTERNS = {
  FOLLOW: 'library.follow.add',
  UNFOLLOW: 'library.follow.remove',
  LIST_FOLLOWS: 'library.follow.list',
  SAVE_PROGRESS: 'library.progress.save',
  GET_PROGRESS: 'library.progress.get',
  LIST_IN_PROGRESS: 'library.progress.list',
} as const;
