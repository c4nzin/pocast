import { Injectable } from '@nestjs/common';
import {
  PAGE_DEFAULT_LIMIT,
  SEARCH_MAX_OFFSET,
  type SearchPodcastsQueryDto,
  type SearchResult,
} from '@pocast/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toPodcastSummary } from './catalog-mappers';

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 50;
const TERM_PATTERN = /[\p{L}\p{N}]+/gu;
const FUZZY_THRESHOLD = 0.4;

interface SearchRow {
  id: string;
  title: string;
  author: string | null;
  imageUrl: string | null;
  language: string | null;
  explicit: boolean;
  episodeCount: number;
  latestEpisodeAt: Date | null;
}

export function toPrefixTsQuery(raw: string): string | null {
  const terms = (raw.toLowerCase().match(TERM_PATTERN) ?? [])
    .map((term) => term.slice(0, MAX_TERM_LENGTH))
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms
    .map((term, index) => (index === terms.length - 1 ? `${term}:*` : term))
    .join(' & ');
}

@Injectable()
export class PodcastSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchPodcastsQueryDto): Promise<SearchResult> {
    const tsQuery = toPrefixTsQuery(query.q);
    if (!tsQuery) return { items: [], nextOffset: null };

    const limit = query.limit ?? PAGE_DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const language = query.language ?? null;
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `SET LOCAL pg_trgm.word_similarity_threshold = ${FUZZY_THRESHOLD}`,
      ),
      this.prisma.$queryRaw<SearchRow[]>`
      SELECT id, title, author, "imageUrl", language, explicit, "episodeCount", "latestEpisodeAt"
      FROM podcasts
      WHERE status = 'ACTIVE'
        AND "latestEpisodeAt" IS NOT NULL
        AND (search_vector @@ to_tsquery('simple', ${tsQuery}) OR ${query.q} <% title)
        AND (${language}::text IS NULL OR language = ${language})
      ORDER BY
        ts_rank_cd(search_vector, to_tsquery('simple', ${tsQuery})) + word_similarity(${query.q}, title) DESC,
        "episodeCount" DESC,
        id
      LIMIT ${limit + 1} OFFSET ${offset}
    `,
    ]);

    const items = rows.slice(0, limit).map(toPodcastSummary);
    const next = offset + limit;
    return {
      items,
      nextOffset:
        rows.length > limit && next <= SEARCH_MAX_OFFSET ? next : null,
    };
  }
}
