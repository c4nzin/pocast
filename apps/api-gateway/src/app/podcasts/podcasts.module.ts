import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  DEFAULT_RABBITMQ_URL,
  CATALOG_QUEUE,
  CATALOG_SERVICE,
} from '@pocast/contracts';
import { PodcastsController } from './podcasts.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: CATALOG_SERVICE,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env.RABBITMQ_URL ?? DEFAULT_RABBITMQ_URL],
            queue: CATALOG_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [PodcastsController],
})
export class PodcastsModule {}
