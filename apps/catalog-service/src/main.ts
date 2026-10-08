import {
  HttpStatus,
  INestApplication,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import {
  CATALOG_INGEST_QUEUE,
  CATALOG_QUEUE,
  DEFAULT_RABBITMQ_URL,
  RpcErrorPayload,
} from '@pocast/contracts';
import { AppModule } from './app/app.module';
import { readIngestConcurrency, readRoles } from './app/config/catalog-config';

function toRpcValidationError(errors: ValidationError[]): RpcException {
  const message = errors
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join(', ');
  const payload: RpcErrorPayload = {
    statusCode: HttpStatus.BAD_REQUEST,
    message,
  };
  return new RpcException(payload);
}

function connectQueue(
  app: INestApplication,
  url: string,
  queue: string,
  extra: Record<string, unknown> = {},
): void {
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [url],
        queue,
        queueOptions: { durable: true },
        ...extra,
      },
    },
    { inheritAppConfig: true },
  );
}

async function bootstrap() {
  const roles = readRoles();
  const rabbitUrl = process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL;

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: toRpcValidationError,
    }),
  );
  app.enableShutdownHooks();

  if (roles.has('api')) {
    connectQueue(app, rabbitUrl, CATALOG_QUEUE);
  }
  if (roles.has('worker')) {
    connectQueue(app, rabbitUrl, CATALOG_INGEST_QUEUE, {
      noAck: false,
      prefetchCount: readIngestConcurrency(),
    });
  }

  await app.startAllMicroservices();
  await app.init();
  Logger.log(`🎧 catalog-service started with roles: ${[...roles].join(', ')}`);
}

bootstrap();
