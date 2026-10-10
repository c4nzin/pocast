import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_BATCHES_PER_TICK = 50;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE = 1000;
const RETENTION_DAYS = 7;
const DAY_MS = 86_400_000;

@Injectable()
export class RefreshTokenCleanerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RefreshTokenCleanerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.tick();
    this.logger.log(
      `Refresh token cleaner started (every ${CLEANUP_INTERVAL_MS / 1000}s)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let total = 0;

    const cutOffDate = new Date(Date.now() - RETENTION_DAYS * DAY_MS);

    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
        const rows = await this.prisma.refreshToken.findMany({
          where: { expiresAt: { lt: cutOffDate } },
          select: { id: true },
          take: BATCH_SIZE,
        });

        if (rows.length === 0) {
          break;
        }

        const { count } = await this.prisma.refreshToken.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });

        total += count;

        if (count < BATCH_SIZE) {
          break;
        }
      }

      if (total > 0) {
        this.logger.log(`deleted ${total} expired refresh tokens`);
      }
    } catch (error) {
      this.logger.error('Scheduler tick failed', error as Error);
    } finally {
      this.running = false;
    }

    return total;
  }
}
