import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AUTH_QUEUE, DEFAULT_RABBITMQ_URL } from '@pocast/contracts';
import { createRpcValidationPipe } from '@pocast/microservice-kit';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL],
        queue: AUTH_QUEUE,
        queueOptions: { durable: true },
      },
    },
  );
  app.useGlobalPipes(createRpcValidationPipe());
  app.enableShutdownHooks();

  await app.listen();
  Logger.log(`auth-service listening on queue "${AUTH_QUEUE}"`);
}

bootstrap();
