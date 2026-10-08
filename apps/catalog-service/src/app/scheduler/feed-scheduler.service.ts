import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CATALOG_EVENTS, FeedRefreshJob } from '@pocast/contracts';
import { lastValueFrom } from 'rxjs';
import { readRoles } from '../config/catalog-config';
import { PrismaService } from '../prisma/prisma.service';

export const INGEST_PUBLISHER = 'INGEST_PUBLISHER';
export const SCHEDULER_TICK_MS = 30_000;
export const SCHEDULER_BATCH_SIZE = 500;
export const CLAIM_LEASE_SECONDS = 600;
const MAX_BATCHES_PER_TICK = 20;

@Injectable()
export class FeedScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FeedScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INGEST_PUBLISHER) private readonly publisher: ClientProxy,
  ) {}

  onApplicationBootstrap(): void {
    if (!readRoles().has('scheduler')) return;
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.timer.unref();
    void this.tick();
    this.logger.log(
      `Feed scheduler started (every ${SCHEDULER_TICK_MS / 1000}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let total = 0;
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
        const ids = await this.claimDueFeeds(SCHEDULER_BATCH_SIZE);
        await Promise.all(
          ids.map((podcastId) =>
            lastValueFrom(
              this.publisher.emit<void, FeedRefreshJob>(
                CATALOG_EVENTS.FEED_REFRESH,
                { podcastId },
              ),
              { defaultValue: undefined },
            ),
          ),
        );
        total += ids.length;
        if (ids.length < SCHEDULER_BATCH_SIZE) break;
      }
      if (total > 0) this.logger.log(`Enqueued ${total} feed refreshes`);
    } catch (error: unknown) {
      this.logger.error('Scheduler tick failed', error as Error);
    } finally {
      this.running = false;
    }
    return total;
  }

  async claimDueFeeds(limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE podcasts
         SET "nextFetchAt" = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS})
       WHERE id IN (
         SELECT id FROM podcasts
          WHERE source = 'RSS'
            AND status <> 'BLOCKED'
            AND "nextFetchAt" <= now()
          ORDER BY "nextFetchAt"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id`;
    return rows.map((row) => row.id);
  }
}
