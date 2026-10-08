import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CREATOR_PATTERNS,
  CREATOR_SERVICE,
  type FeedDocument,
  type HostedSyncJob,
} from '@pocast/contracts';
import { firstValueFrom, timeout } from 'rxjs';
import { FeedIngestService } from './feed-ingest.service';

const FEED_RPC_TIMEOUT_MS = 10_000;

@Injectable()
export class HostedFeedSync {
  private readonly logger = new Logger(HostedFeedSync.name);

  constructor(
    @Inject(CREATOR_SERVICE) private readonly creatorClient: ClientProxy,
    private readonly ingest: FeedIngestService,
  ) {}

  async sync(job: HostedSyncJob): Promise<void> {
    const document = await firstValueFrom(
      this.creatorClient
        .send<FeedDocument>(CREATOR_PATTERNS.GET_FEED, { showId: job.showId })
        .pipe(timeout(FEED_RPC_TIMEOUT_MS)),
    );
    const podcastId = await this.ingest.upsertHostedFeed(
      job.feedUrl,
      document.xml,
    );
    this.logger.log(`Hosted show ${job.showId} synced as podcast ${podcastId}`);
  }
}
