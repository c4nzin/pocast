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
import {
  CATALOG_PATTERNS,
  CATALOG_SERVICE,
  Episode,
  ImportFeedDto,
  ListEpisodesQueryDto,
  ListPodcastsQueryDto,
  Page,
  PageQueryDto,
  PodcastDetail,
  PodcastSummary,
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
}
