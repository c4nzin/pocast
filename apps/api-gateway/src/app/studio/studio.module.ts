import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CREATOR_QUEUE,
  CREATOR_SERVICE,
  DEFAULT_RABBITMQ_URL,
} from '@pocast/contracts';
import { FeedsController } from './feeds.controller';
import { StudioController } from './studio.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
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
  controllers: [StudioController, FeedsController],
})
export class StudioModule {}
