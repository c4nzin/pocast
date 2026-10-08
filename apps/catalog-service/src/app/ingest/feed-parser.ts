import { categorySlug, CATEGORY_SLUGS } from '@pocast/contracts';
import { XMLParser } from 'fast-xml-parser';
import {
  attr,
  httpUrl,
  normalizeLanguage,
  parseDate,
  parseDuration,
  parseExplicit,
  parsePositiveInt,
  parseSizeBytes,
  text,
} from './feed-values';

export const MAX_EPISODES_PER_FEED = 3000;
const KNOWN_CATEGORIES = new Set(CATEGORY_SLUGS);
const EPISODE_TYPES = new Set(['FULL', 'TRAILER', 'BONUS']);

export interface ParsedEpisode {
  readonly guid: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly publishedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly season: number | null;
  readonly episodeNumber: number | null;
  readonly episodeType: 'FULL' | 'TRAILER' | 'BONUS';
  readonly explicit: boolean;
  readonly mediaUrl: string;
  readonly mediaMimeType: string | null;
  readonly mediaSizeBytes: bigint | null;
  readonly mediaType: 'AUDIO' | 'VIDEO';
}

export interface ParsedFeed {
  readonly guid: string | null;
  readonly title: string;
  readonly author: string | null;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly websiteUrl: string | null;
  readonly language: string | null;
  readonly explicit: boolean;
  readonly ownerName: string | null;
  readonly ownerEmail: string | null;
  readonly categories: readonly string[];
  readonly episodes: readonly ParsedEpisode[];
}

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedParseError';
  }
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) =>
    name === 'item' || name === 'itunes:category' || name === 'category',
});

function collectCategories(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => {
    const name = attr(node, 'text');
    const own = name ? [categorySlug(name)] : [];
    return [...own, ...collectCategories((node as XmlNode)['itunes:category'])];
  });
}

function parseEpisode(item: XmlNode): ParsedEpisode | null {
  const enclosure = item['enclosure'];
  const mediaUrl = httpUrl(attr(enclosure, 'url'));
  const title = text(item['title']) ?? text(item['itunes:title']);
  if (!mediaUrl || !title) return null;

  const mimeType = attr(enclosure, 'type');
  const episodeType = text(item['itunes:episodeType'])?.toUpperCase() ?? 'FULL';
  return {
    guid: text(item['guid']) ?? mediaUrl,
    title,
    description:
      text(item['content:encoded']) ??
      text(item['description']) ??
      text(item['itunes:summary']),
    imageUrl: httpUrl(attr(item['itunes:image'], 'href')),
    publishedAt: parseDate(text(item['pubDate'])),
    durationSeconds: parseDuration(text(item['itunes:duration'])),
    season: parsePositiveInt(text(item['itunes:season'])),
    episodeNumber: parsePositiveInt(text(item['itunes:episode'])),
    episodeType: (EPISODE_TYPES.has(episodeType)
      ? episodeType
      : 'FULL') as ParsedEpisode['episodeType'],
    explicit: parseExplicit(text(item['itunes:explicit'])),
    mediaUrl,
    mediaMimeType: mimeType,
    mediaSizeBytes: parseSizeBytes(attr(enclosure, 'length')),
    mediaType: mimeType?.startsWith('video/') ? 'VIDEO' : 'AUDIO',
  };
}

function newestFirst(a: ParsedEpisode, b: ParsedEpisode): number {
  return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
}

function dedupeByGuid(episodes: readonly ParsedEpisode[]): ParsedEpisode[] {
  const seen = new Set<string>();
  return episodes.filter((episode) => {
    if (seen.has(episode.guid)) return false;
    seen.add(episode.guid);
    return true;
  });
}

export function parseFeed(xml: string): ParsedFeed {
  let document: XmlNode;
  try {
    document = parser.parse(xml) as XmlNode;
  } catch (error: unknown) {
    throw new FeedParseError(`Invalid XML: ${(error as Error).message}`);
  }
  const rawChannel = (document['rss'] as XmlNode | undefined)?.['channel'];
  if (rawChannel === undefined) {
    throw new FeedParseError('Not an RSS feed (missing rss > channel)');
  }
  const channel = (
    typeof rawChannel === 'object' && rawChannel !== null ? rawChannel : {}
  ) as XmlNode;
  const title = text(channel['title']) ?? text(channel['itunes:title']);
  if (!title) {
    throw new FeedParseError('Feed has no title');
  }

  const owner = channel['itunes:owner'] as XmlNode | undefined;
  const items = (channel['item'] as XmlNode[] | undefined) ?? [];
  const episodes = dedupeByGuid(
    items.map(parseEpisode).filter((e): e is ParsedEpisode => e !== null),
  )
    .sort(newestFirst)
    .slice(0, MAX_EPISODES_PER_FEED);

  return {
    guid: text(channel['podcast:guid']),
    title,
    author: text(channel['itunes:author']),
    description:
      text(channel['description']) ?? text(channel['itunes:summary']),
    imageUrl:
      httpUrl(attr(channel['itunes:image'], 'href')) ??
      httpUrl(text((channel['image'] as XmlNode | undefined)?.['url'])),
    websiteUrl: httpUrl(text(channel['link'])),
    language: normalizeLanguage(text(channel['language'])),
    explicit: parseExplicit(text(channel['itunes:explicit'])),
    ownerName: text(owner?.['itunes:name']),
    ownerEmail: text(owner?.['itunes:email'])?.toLowerCase() ?? null,
    categories: [
      ...new Set(collectCategories(channel['itunes:category'])),
    ].filter((slug) => KNOWN_CATEGORIES.has(slug)),
    episodes,
  };
}
