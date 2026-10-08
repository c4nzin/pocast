import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CATALOG_INGEST_QUEUE,
  CREATOR_QUEUE,
  CREATOR_SERVICE,
  DEFAULT_RABBITMQ_URL,
} from '@pocast/contracts';
import { CatalogQueryService } from './catalog/catalog-query.service';
import { CatalogController } from './catalog/catalog.controller';
import { PodcastSearchService } from './catalog/podcast-search.service';
import { CategoryRegistry } from './categories/category-registry.service';
import { FeedFetcher, HttpFeedFetcher } from './ingest/feed-fetcher';
import { FeedIngestService } from './ingest/feed-ingest.service';
import { HostedFeedSync } from './ingest/hosted-feed-sync.service';
import { IngestController } from './ingest/ingest.controller';
import { PrismaModule } from './prisma/prisma.module';
import {
  FeedScheduler,
  INGEST_PUBLISHER,
} from './scheduler/feed-scheduler.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: INGEST_PUBLISHER,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL],
            queue: CATALOG_INGEST_QUEUE,
            queueOptions: { durable: true },
            persistent: true,
          },
        }),
      },
      {
        name: CREATOR_SERVICE,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL],
            queue: CREATOR_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [CatalogController, IngestController],
  providers: [
    CategoryRegistry,
    CatalogQueryService,
    PodcastSearchService,
    FeedIngestService,
    HostedFeedSync,
    FeedScheduler,
    { provide: FeedFetcher, useFactory: () => new HttpFeedFetcher() },
  ],
})
export class AppModule {}
