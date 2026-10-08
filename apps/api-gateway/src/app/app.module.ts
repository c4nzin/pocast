import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { LibraryModule } from './library/library.module';
import { StudioModule } from './studio/studio.module';
import { PodcastsModule } from './podcasts/podcasts.module';

export const DEFAULT_RATE_LIMIT = { ttl: 60_000, limit: 300 } as const;

function requireRedisUrl(): string {
  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error(
      'REDIS_URL is not set (rate limits must be shared across replicas)',
    );
  }
  return url;
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ...DEFAULT_RATE_LIMIT }],
        storage: new ThrottlerStorageRedisService(requireRedisUrl()),
      }),
    }),
    AuthModule,
    PodcastsModule,
    LibraryModule,
    StudioModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
