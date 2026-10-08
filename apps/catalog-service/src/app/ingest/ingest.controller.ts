import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  CATALOG_EVENTS,
  type FeedRefreshJob,
  type HostedSyncJob,
} from '@pocast/contracts';
import { FeedIngestService } from './feed-ingest.service';
import { HostedFeedSync } from './hosted-feed-sync.service';

interface AmqpChannel {
  ack(message: unknown): void;
}

@Controller()
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(
    private readonly ingest: FeedIngestService,
    private readonly hosted: HostedFeedSync,
  ) {}

  @EventPattern(CATALOG_EVENTS.FEED_REFRESH)
  async refresh(
    @Payload() job: FeedRefreshJob,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.ingest.refreshFeed(job.podcastId);
    } catch (error: unknown) {
      this.logger.error(
        `Refresh job crashed for ${job.podcastId}`,
        error as Error,
      );
    } finally {
      (context.getChannelRef() as AmqpChannel).ack(context.getMessage());
    }
  }

  @EventPattern(CATALOG_EVENTS.HOSTED_SYNC)
  async syncHosted(
    @Payload() job: HostedSyncJob,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.hosted.sync(job);
    } catch (error: unknown) {
      this.logger.error(
        `Hosted sync failed for show ${job.showId}`,
        error as Error,
      );
    } finally {
      (context.getChannelRef() as AmqpChannel).ack(context.getMessage());
    }
  }
}
