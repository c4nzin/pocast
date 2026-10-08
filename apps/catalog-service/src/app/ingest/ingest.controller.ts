import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CATALOG_EVENTS, type FeedRefreshJob } from '@pocast/contracts';
import { FeedIngestService } from './feed-ingest.service';

interface AmqpChannel {
  ack(message: unknown): void;
}

@Controller()
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly ingest: FeedIngestService) {}

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
}
