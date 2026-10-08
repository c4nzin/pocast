import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CATALOG_PATTERNS,
  CATALOG_SERVICE,
  type EpisodeProgress,
  type FollowCommand,
  type FollowedPodcast,
  type GetProgressCommand,
  LIBRARY_PATTERNS,
  LIBRARY_SERVICE,
  type LibraryPageCommand,
  type Page,
  PageQueryDto,
  type PodcastDetail,
  ProgressLookupQueryDto,
  SaveProgressDto,
  type SaveProgressCommand,
} from '@pocast/contracts';
import type { AuthenticatedUser } from '../auth/access-token-verifier';
import { Authenticated, CurrentUser } from '../auth/auth.guard';
import { sendRpc } from '../common/send-rpc';

const PRIVATE_NO_STORE = 'private, no-store';

@Controller('library')
@Authenticated()
export class LibraryController {
  constructor(
    @Inject(LIBRARY_SERVICE) private readonly libraryClient: ClientProxy,
    @Inject(CATALOG_SERVICE) private readonly catalogClient: ClientProxy,
  ) {}

  @Get('follows')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  listFollows(
    @CurrentUser() user: AuthenticatedUser,
    @Query() page: PageQueryDto,
  ): Promise<Page<FollowedPodcast>> {
    const command: LibraryPageCommand = { ...page, userId: user.userId };
    return sendRpc(this.libraryClient, LIBRARY_PATTERNS.LIST_FOLLOWS, command);
  }

  @Put('follows/:podcastId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  async follow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('podcastId', ParseUUIDPipe) podcastId: string,
  ): Promise<FollowedPodcast> {
    await sendRpc<PodcastDetail>(
      this.catalogClient,
      CATALOG_PATTERNS.GET_PODCAST,
      podcastId,
    );
    const command: FollowCommand = { userId: user.userId, podcastId };
    return sendRpc(this.libraryClient, LIBRARY_PATTERNS.FOLLOW, command);
  }

  @Delete('follows/:podcastId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  unfollow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('podcastId', ParseUUIDPipe) podcastId: string,
  ): Promise<{ ok: true }> {
    const command: FollowCommand = { userId: user.userId, podcastId };
    return sendRpc(this.libraryClient, LIBRARY_PATTERNS.UNFOLLOW, command);
  }

  @Get('progress')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  getProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProgressLookupQueryDto,
  ): Promise<EpisodeProgress[]> {
    const command: GetProgressCommand = {
      userId: user.userId,
      episodeIds: query.episodeIds,
    };
    return sendRpc(this.libraryClient, LIBRARY_PATTERNS.GET_PROGRESS, command);
  }

  @Get('progress/in-progress')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  listInProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Query() page: PageQueryDto,
  ): Promise<Page<EpisodeProgress>> {
    const command: LibraryPageCommand = { ...page, userId: user.userId };
    return sendRpc(
      this.libraryClient,
      LIBRARY_PATTERNS.LIST_IN_PROGRESS,
      command,
    );
  }

  @Put('progress/:episodeId')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  saveProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @Body() body: SaveProgressDto,
  ): Promise<EpisodeProgress> {
    const command: SaveProgressCommand = {
      ...body,
      userId: user.userId,
      episodeId,
    };
    return sendRpc(this.libraryClient, LIBRARY_PATTERNS.SAVE_PROGRESS, command);
  }
}
