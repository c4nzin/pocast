import { Controller, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import {
  CATALOG_PATTERNS,
  Episode,
  ImportFeedDto,
  ListEpisodesQueryDto,
  ListPodcastsQueryDto,
  Page,
  PodcastDetail,
  PodcastSummary,
  RpcErrorPayload,
  SearchPodcastsQueryDto,
  type SearchResult,
} from '@pocast/contracts';
import { FeedFetchError } from '../ingest/feed-fetcher';
import { FeedIngestService } from '../ingest/feed-ingest.service';
import { FeedParseError } from '../ingest/feed-parser';
import { CatalogQueryService } from './catalog-query.service';
import { PodcastSearchService } from './podcast-search.service';

function rpcError(statusCode: number, message: string): RpcException {
  const payload: RpcErrorPayload = { statusCode, message };
  return new RpcException(payload);
}

@Controller()
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly queries: CatalogQueryService,
    private readonly ingest: FeedIngestService,
    private readonly searcher: PodcastSearchService,
  ) {}

  @MessagePattern(CATALOG_PATTERNS.SEARCH_PODCASTS)
  searchPodcasts(
    @Payload() query: SearchPodcastsQueryDto,
  ): Promise<SearchResult> {
    return this.searcher.search(query);
  }

  @MessagePattern(CATALOG_PATTERNS.LIST_PODCASTS)
  listPodcasts(
    @Payload() query: ListPodcastsQueryDto,
  ): Promise<Page<PodcastSummary>> {
    return this.queries.listPodcasts(query);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_PODCAST)
  getPodcast(@Payload(ParseUUIDPipe) id: string): Promise<PodcastDetail> {
    return this.queries.getPodcast(id);
  }

  @MessagePattern(CATALOG_PATTERNS.LIST_EPISODES)
  listEpisodes(@Payload() query: ListEpisodesQueryDto): Promise<Page<Episode>> {
    return this.queries.listEpisodes(query);
  }

  @MessagePattern(CATALOG_PATTERNS.IMPORT_FEED)
  async importFeed(@Payload() input: ImportFeedDto): Promise<PodcastDetail> {
    try {
      const id = await this.ingest.importFeed(input.feedUrl);
      return await this.queries.getPodcast(id);
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      if (error instanceof FeedFetchError || error instanceof FeedParseError) {
        throw rpcError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          `Could not import feed: ${error.message}`,
        );
      }
      if (error instanceof TypeError) {
        throw rpcError(HttpStatus.BAD_REQUEST, 'Invalid feed URL');
      }
      this.logger.error(`Import failed for ${input.feedUrl}`, error as Error);
      throw error;
    }
  }
}
