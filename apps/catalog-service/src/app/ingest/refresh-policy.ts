const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const MIN_REFRESH_MS = 15 * MINUTE_MS;
export const MAX_REFRESH_MS = DAY_MS;
const JITTER_RATIO = 0.1;

export const HIDE_AFTER_CONSECUTIVE_ERRORS = 20;

export function refreshIntervalMs(
  latestEpisodeAt: Date | null,
  now: Date,
): number {
  if (!latestEpisodeAt) return MAX_REFRESH_MS;
  const age = now.getTime() - latestEpisodeAt.getTime();
  if (age <= DAY_MS) return MIN_REFRESH_MS;
  if (age <= 7 * DAY_MS) return HOUR_MS;
  if (age <= 30 * DAY_MS) return 6 * HOUR_MS;
  return MAX_REFRESH_MS;
}

export function errorBackoffMs(consecutiveErrors: number): number {
  const exponent = Math.max(0, consecutiveErrors - 1);
  return Math.min(MAX_REFRESH_MS, MIN_REFRESH_MS * 2 ** Math.min(exponent, 16));
}

export function withJitter(
  intervalMs: number,
  random: () => number = Math.random,
): number {
  const spread = intervalMs * JITTER_RATIO;
  return Math.round(intervalMs - spread + random() * 2 * spread);
}
