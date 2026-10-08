import 'reflect-metadata';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CATEGORY_SLUGS } from '../catalog/categories.js';
import { LANGUAGE_TAG_PATTERN } from '../catalog/catalog.dto.js';
import {
  AUDIO_CONTENT_TYPES,
  type AudioContentType,
  type CreatorEpisodeType,
  EPISODE_TYPES,
  IMAGE_CONTENT_TYPES,
  type ImageContentType,
  type PublishStatus,
} from './creator.patterns.js';

export const SHOW_TITLE_MAX = 255;
export const SHOW_DESCRIPTION_MAX = 4000;
export const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024;
export const EPISODE_DURATION_MAX_SECONDS = 7 * 24 * 60 * 60;

const CATEGORY_MESSAGE = { message: 'category must be a known category slug' };

export class CreateShowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_TITLE_MAX)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_DESCRIPTION_MAX)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHOW_TITLE_MAX)
  author?: string;

  @IsString()
  @Matches(LANGUAGE_TAG_PATTERN)
  language!: string;

  @IsIn(CATEGORY_SLUGS, CATEGORY_MESSAGE)
  category!: string;

  @IsOptional()
  @IsBoolean()
  explicit?: boolean;
}

export class UpdateShowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_TITLE_MAX)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_DESCRIPTION_MAX)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHOW_TITLE_MAX)
  author?: string;

  @IsOptional()
  @IsString()
  @Matches(LANGUAGE_TAG_PATTERN)
  language?: string;

  @IsOptional()
  @IsIn(CATEGORY_SLUGS, CATEGORY_MESSAGE)
  category?: string;

  @IsOptional()
  @IsBoolean()
  explicit?: boolean;
}

export class CreateEpisodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_TITLE_MAX)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SHOW_DESCRIPTION_MAX)
  description!: string;

  @IsIn(EPISODE_TYPES)
  episodeType!: CreatorEpisodeType;

  @IsOptional()
  @IsInt()
  @Min(1)
  seasonNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  episodeNumber?: number;

  @IsOptional()
  @IsBoolean()
  explicit?: boolean;
}

export class RequestUploadDto {
  @IsIn(AUDIO_CONTENT_TYPES)
  contentType!: AudioContentType;

  @IsInt()
  @Min(1)
  @Max(UPLOAD_MAX_BYTES)
  sizeBytes!: number;
}

export class RequestArtworkUploadDto {
  @IsIn(IMAGE_CONTENT_TYPES)
  contentType!: ImageContentType;

  @IsInt()
  @Min(1)
  @Max(ARTWORK_MAX_BYTES)
  sizeBytes!: number;
}

export class CompleteUploadDto {
  @IsInt()
  @Min(1)
  @Max(EPISODE_DURATION_MAX_SECONDS)
  durationSeconds!: number;
}

export interface CreatorCategory {
  readonly slug: string;
  readonly name: string;
  readonly parentName: string | null;
}

export interface CreateShowCommand extends Omit<
  CreateShowDto,
  'category' | 'explicit'
> {
  readonly userId: string;
  readonly category: CreatorCategory;
  readonly explicit: boolean;
}

export interface UpdateShowCommand extends Omit<UpdateShowDto, 'category'> {
  readonly userId: string;
  readonly showId: string;
  readonly category?: CreatorCategory;
}

export interface ShowRefCommand {
  readonly userId: string;
  readonly showId: string;
}

export interface EpisodeRefCommand {
  readonly userId: string;
  readonly episodeId: string;
}

export interface CreateEpisodeCommand extends Omit<
  CreateEpisodeDto,
  'explicit'
> {
  readonly userId: string;
  readonly showId: string;
  readonly explicit: boolean;
}

export interface RequestUploadCommand extends RequestUploadDto {
  readonly userId: string;
  readonly episodeId: string;
}

export interface RequestArtworkUploadCommand extends RequestArtworkUploadDto {
  readonly userId: string;
  readonly showId: string;
}

export interface CompleteUploadCommand extends CompleteUploadDto {
  readonly userId: string;
  readonly episodeId: string;
}

export interface CreatorShow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly author: string | null;
  readonly language: string;
  readonly categorySlug: string;
  readonly explicit: boolean;
  readonly imageUrl: string | null;
  readonly status: PublishStatus;
  readonly feedUrl: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatorEpisode {
  readonly id: string;
  readonly showId: string;
  readonly title: string;
  readonly description: string;
  readonly episodeType: CreatorEpisodeType;
  readonly seasonNumber: number | null;
  readonly episodeNumber: number | null;
  readonly explicit: boolean;
  readonly status: PublishStatus;
  readonly mediaUrl: string | null;
  readonly mediaContentType: AudioContentType | null;
  readonly mediaSizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PresignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  readonly contentType: AudioContentType | ImageContentType;
  readonly expiresAt: string;
}

export interface FeedDocument {
  readonly xml: string;
  readonly updatedAt: string;
}
