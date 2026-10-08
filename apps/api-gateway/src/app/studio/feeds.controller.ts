import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CREATOR_PATTERNS,
  CREATOR_SERVICE,
  type FeedDocument,
} from '@pocast/contracts';
import { sendRpc } from '../common/send-rpc';

export const FEED_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=600';

@Controller('feeds')
export class FeedsController {
  constructor(
    @Inject(CREATOR_SERVICE) private readonly creatorClient: ClientProxy,
  ) {}

  @Get(':showId')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', FEED_CACHE_CONTROL)
  async feed(@Param('showId', ParseUUIDPipe) showId: string): Promise<string> {
    const document = await sendRpc<FeedDocument>(
      this.creatorClient,
      CREATOR_PATTERNS.GET_FEED,
      { showId },
    );
    return document.xml;
  }
}
