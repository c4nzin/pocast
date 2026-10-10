import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CATEGORY_SLUGS } from './categories.js';

export const PAGE_DEFAULT_LIMIT = 20;
export const PAGE_MAX_LIMIT = 50;
export const CURSOR_MAX_LENGTH = 200;
export const FEED_URL_MAX_LENGTH = 2048;
export const CATEGORY_CACHE_TTL_MS = 60_000;

export const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/;

export class PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX_LIMIT)
  limit?: number;
}

export class ListPodcastsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Matches(LANGUAGE_TAG_PATTERN)
  language?: string;

  @IsOptional()
  @IsIn(CATEGORY_SLUGS, { message: 'category must be a known category slug' })
  category?: string;
}

export class ListEpisodesQueryDto extends PageQueryDto {
  @IsUUID()
  podcastId!: string;
}

export class GetEpisodeQueryDto {
  @IsString()
  @IsUUID()
  podcastId!: string;

  @IsString()
  @IsUUID()
  episodeId!: string;
}

export class ImportFeedDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(FEED_URL_MAX_LENGTH)
  feedUrl!: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PodcastSummary {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly imageUrl: string | null;
  readonly language: string | null;
  readonly explicit: boolean;
  readonly episodeCount: number;
  readonly latestEpisodeAt: string | null;
}

export interface PodcastDetail extends PodcastSummary {
  readonly source: 'RSS' | 'HOSTED';
  readonly description: string | null;
  readonly websiteUrl: string | null;
  readonly categories: readonly string[];
}

export interface EpisodeMedia {
  readonly url: string;
  readonly type: 'AUDIO' | 'VIDEO';
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
}

export interface Episode {
  readonly id: string;
  readonly podcastId: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly publishedAt: string;
  readonly durationSeconds: number | null;
  readonly season: number | null;
  readonly episodeNumber: number | null;
  readonly episodeType: 'FULL' | 'TRAILER' | 'BONUS';
  readonly explicit: boolean;
  readonly media: EpisodeMedia;
}

export interface CategoryNode {
  readonly slug: string;
  readonly name: string;
  readonly podcastCount: number;
  readonly children: readonly CategoryNode[];
}
