import 'reflect-metadata';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { PageQueryDto } from '../catalog/catalog.dto.js';

export const PROGRESS_BATCH_MAX = 100;
export const POSITION_MAX_SECONDS = 7 * 24 * 60 * 60;

const splitCommaList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

export class SaveProgressDto {
  @IsUUID()
  podcastId!: string;

  @IsInt()
  @Min(0)
  @Max(POSITION_MAX_SECONDS)
  positionSeconds!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(POSITION_MAX_SECONDS)
  durationSeconds?: number;

  @IsBoolean()
  completed!: boolean;

  @IsISO8601({ strict: true })
  playedAt!: string;
}

export class ProgressLookupQueryDto {
  @Transform(splitCommaList)
  @ArrayMinSize(1)
  @ArrayMaxSize(PROGRESS_BATCH_MAX)
  @IsUUID('all', { each: true })
  episodeIds!: string[];
}

export interface FollowCommand {
  readonly userId: string;
  readonly podcastId: string;
}

export interface LibraryPageCommand extends PageQueryDto {
  readonly userId: string;
}

export interface SaveProgressCommand extends SaveProgressDto {
  readonly userId: string;
  readonly episodeId: string;
}

export interface GetProgressCommand {
  readonly userId: string;
  readonly episodeIds: readonly string[];
}

export interface FollowedPodcast {
  readonly podcastId: string;
  readonly followedAt: string;
}

export interface EpisodeProgress {
  readonly episodeId: string;
  readonly podcastId: string;
  readonly positionSeconds: number;
  readonly durationSeconds: number | null;
  readonly completed: boolean;
  readonly playedAt: string;
}
