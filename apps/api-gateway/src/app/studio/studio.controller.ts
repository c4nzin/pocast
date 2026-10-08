import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import {
  CompleteUploadDto,
  CREATOR_PATTERNS,
  CREATOR_SERVICE,
  type CompleteUploadCommand,
  type CreateEpisodeCommand,
  CreateEpisodeDto,
  type CreateShowCommand,
  CreateShowDto,
  type CreatorEpisode,
  type CreatorShow,
  type EpisodeRefCommand,
  type PresignedUpload,
  type RequestArtworkUploadCommand,
  RequestArtworkUploadDto,
  type RequestUploadCommand,
  RequestUploadDto,
  type ShowRefCommand,
  type UpdateShowCommand,
  UpdateShowDto,
  type UserIdCommand,
} from '@pocast/contracts';
import type { AuthenticatedUser } from '../auth/access-token-verifier';
import { Authenticated, CurrentUser } from '../auth/auth.guard';
import { sendRpc } from '../common/send-rpc';
import { resolveCategory } from './creator-category';

const PRIVATE_NO_STORE = 'private, no-store';
const MINUTE_MS = 60_000;

@Controller('studio')
@Authenticated()
export class StudioController {
  constructor(
    @Inject(CREATOR_SERVICE) private readonly creatorClient: ClientProxy,
  ) {}

  @Post('shows')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
  createShow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateShowDto,
  ): Promise<CreatorShow> {
    const command: CreateShowCommand = {
      ...body,
      userId: user.userId,
      category: resolveCategory(body.category),
      explicit: body.explicit ?? false,
    };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.CREATE_SHOW, command);
  }

  @Get('shows')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  listShows(@CurrentUser() user: AuthenticatedUser): Promise<CreatorShow[]> {
    const command: UserIdCommand = { userId: user.userId };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.LIST_SHOWS, command);
  }

  @Get('shows/:showId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  getShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
  ): Promise<CreatorShow> {
    const command: ShowRefCommand = { userId: user.userId, showId };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.GET_SHOW, command);
  }

  @Patch('shows/:showId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  updateShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
    @Body() body: UpdateShowDto,
  ): Promise<CreatorShow> {
    const command: UpdateShowCommand = {
      ...body,
      userId: user.userId,
      showId,
      category: body.category ? resolveCategory(body.category) : undefined,
    };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.UPDATE_SHOW, command);
  }

  @Post('shows/:showId/artwork')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: MINUTE_MS } })
  requestArtworkUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
    @Body() body: RequestArtworkUploadDto,
  ): Promise<PresignedUpload> {
    const command: RequestArtworkUploadCommand = {
      ...body,
      userId: user.userId,
      showId,
    };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.REQUEST_ARTWORK_UPLOAD,
      command,
    );
  }

  @Post('shows/:showId/artwork/complete')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @HttpCode(HttpStatus.OK)
  completeArtworkUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
  ): Promise<CreatorShow> {
    const command: ShowRefCommand = { userId: user.userId, showId };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.COMPLETE_ARTWORK_UPLOAD,
      command,
    );
  }

  @Post('shows/:showId/episodes')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  createEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
    @Body() body: CreateEpisodeDto,
  ): Promise<CreatorEpisode> {
    const command: CreateEpisodeCommand = {
      ...body,
      userId: user.userId,
      showId,
      explicit: body.explicit ?? false,
    };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.CREATE_EPISODE,
      command,
    );
  }

  @Get('shows/:showId/episodes')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  listEpisodes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('showId', ParseUUIDPipe) showId: string,
  ): Promise<CreatorEpisode[]> {
    const command: ShowRefCommand = { userId: user.userId, showId };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.LIST_EPISODES, command);
  }

  @Get('episodes/:episodeId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  getEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
  ): Promise<CreatorEpisode> {
    const command: EpisodeRefCommand = { userId: user.userId, episodeId };
    return sendRpc(this.creatorClient, CREATOR_PATTERNS.GET_EPISODE, command);
  }

  @Post('episodes/:episodeId/upload')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: MINUTE_MS } })
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @Body() body: RequestUploadDto,
  ): Promise<PresignedUpload> {
    const command: RequestUploadCommand = {
      ...body,
      userId: user.userId,
      episodeId,
    };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.REQUEST_UPLOAD,
      command,
    );
  }

  @Post('episodes/:episodeId/upload/complete')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @HttpCode(HttpStatus.OK)
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @Body() body: CompleteUploadDto,
  ): Promise<CreatorEpisode> {
    const command: CompleteUploadCommand = {
      ...body,
      userId: user.userId,
      episodeId,
    };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.COMPLETE_UPLOAD,
      command,
    );
  }

  @Post('episodes/:episodeId/publish')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @HttpCode(HttpStatus.OK)
  publishEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
  ): Promise<CreatorEpisode> {
    const command: EpisodeRefCommand = { userId: user.userId, episodeId };
    return sendRpc(
      this.creatorClient,
      CREATOR_PATTERNS.PUBLISH_EPISODE,
      command,
    );
  }
}
