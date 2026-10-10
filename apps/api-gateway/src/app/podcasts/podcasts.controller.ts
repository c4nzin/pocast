import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import {
  CATALOG_PATTERNS,
  CATALOG_SERVICE,
  Episode,
  GetEpisodeQueryDto,
  ImportFeedDto,
  ListEpisodesQueryDto,
  ListPodcastsQueryDto,
  Page,
  PageQueryDto,
  PodcastDetail,
  PodcastSummary,
  SearchPodcastsQueryDto,
  type SearchResult,
} from '@pocast/contracts';
import { Authenticated } from '../auth/auth.guard';
import { sendRpc } from '../common/send-rpc';

export const CATALOG_CACHE_CONTROL =
  'public, max-age=60, stale-while-revalidate=300';
export const IMPORT_TIMEOUT_MS = 45_000;

@Controller('podcasts')
export class PodcastsController {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalogClient: ClientProxy,
  ) {}

  @Get()
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  list(@Query() query: ListPodcastsQueryDto): Promise<Page<PodcastSummary>> {
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.LIST_PODCASTS, query);
  }

  @Get('search')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  search(@Query() query: SearchPodcastsQueryDto): Promise<SearchResult> {
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.SEARCH_PODCASTS, query);
  }

  @Get(':id')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PodcastDetail> {
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.GET_PODCAST, id);
  }

  @Get(':id/episodes')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  listEpisodes(
    @Param('id', ParseUUIDPipe) podcastId: string,
    @Query() page: PageQueryDto,
  ): Promise<Page<Episode>> {
    const query: ListEpisodesQueryDto = { ...page, podcastId };
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.LIST_EPISODES, query);
  }

  @Post('import')
  @Authenticated('EDITOR', 'ADMIN')
  import(@Body() input: ImportFeedDto): Promise<PodcastDetail> {
    return sendRpc(
      this.catalogClient,
      CATALOG_PATTERNS.IMPORT_FEED,
      input,
      IMPORT_TIMEOUT_MS,
    );
  }

  @Get(':id/episodes/:episodeId')
  @Header('Cache-Control', CATALOG_CACHE_CONTROL)
  getEpisode(
    @Param('id', ParseUUIDPipe) podcastId: string,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
  ): Promise<Episode> {
    const query: GetEpisodeQueryDto = { podcastId, episodeId };
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.GET_EPISODE, query);
  }
}
