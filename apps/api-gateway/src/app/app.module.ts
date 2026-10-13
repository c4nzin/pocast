import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { LibraryModule } from './library/library.module';
import { StudioModule } from './studio/studio.module';
import { CategoriesModule } from './categories/categories.module';
import { PodcastsModule } from './podcasts/podcasts.module';
import { RequestContextMiddleware } from './observability/request-context.middleware';

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
    CategoriesModule,
    LibraryModule,
    StudioModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      )
      .forRoutes('*path');
  }
}
