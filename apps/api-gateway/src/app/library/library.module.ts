import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  DEFAULT_RABBITMQ_URL,
  LIBRARY_QUEUE,
  LIBRARY_SERVICE,
} from '@pocast/contracts';
import { PodcastsModule } from '../podcasts/podcasts.module';
import { LibraryController } from './library.controller';

@Module({
  imports: [
    PodcastsModule,
    ClientsModule.registerAsync([
      {
        name: LIBRARY_SERVICE,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL],
            queue: LIBRARY_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [LibraryController],
})
export class LibraryModule {}
