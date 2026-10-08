import { normalizeFeedUrl } from './feed-url';
import {
  errorBackoffMs,
  MAX_REFRESH_MS,
  MIN_REFRESH_MS,
  refreshIntervalMs,
  withJitter,
} from './refresh-policy';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date('2026-10-07T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('refreshIntervalMs', () => {
  it.each([
    ['never published', null, MAX_REFRESH_MS],
    ['published today', ago(2 * HOUR), MIN_REFRESH_MS],
    ['published this week', ago(3 * DAY), HOUR],
    ['published this month', ago(20 * DAY), 6 * HOUR],
    ['dormant', ago(200 * DAY), MAX_REFRESH_MS],
  ])('%s', (_label, latest, expected) => {
    expect(refreshIntervalMs(latest, now)).toBe(expected);
  });
});

describe('errorBackoffMs', () => {
  it('doubles from 15 minutes and caps at 24 hours', () => {
    expect(errorBackoffMs(1)).toBe(MIN_REFRESH_MS);
    expect(errorBackoffMs(2)).toBe(2 * MIN_REFRESH_MS);
    expect(errorBackoffMs(3)).toBe(4 * MIN_REFRESH_MS);
    expect(errorBackoffMs(50)).toBe(MAX_REFRESH_MS);
  });
});

describe('withJitter', () => {
  it('stays within ±10%', () => {
    expect(withJitter(1000, () => 0)).toBe(900);
    expect(withJitter(1000, () => 1)).toBe(1100);
    expect(withJitter(1000, () => 0.5)).toBe(1000);
  });
});

describe('normalizeFeedUrl', () => {
  it('canonicalizes scheme, host, default port, fragment and credentials', () => {
    expect(
      normalizeFeedUrl('  HTTPS://user:pw@Example.COM:443/Feed.xml?a=1#frag '),
    ).toBe('https://example.com/Feed.xml?a=1');
  });

  it('rejects non-http protocols', () => {
    expect(() => normalizeFeedUrl('ftp://example.com/feed')).toThrow(
      'Unsupported',
    );
  });
});
