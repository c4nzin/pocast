import 'reflect-metadata';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LANGUAGE_TAG_PATTERN,
  PAGE_MAX_LIMIT,
  type PodcastSummary,
} from './catalog.dto.js';

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_MAX_OFFSET = 200;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SearchPodcastsQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  q!: string;

  @IsOptional()
  @IsString()
  @Matches(LANGUAGE_TAG_PATTERN)
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(SEARCH_MAX_OFFSET)
  offset?: number;
}

export interface SearchResult {
  readonly items: readonly PodcastSummary[];
  readonly nextOffset: number | null;
}
