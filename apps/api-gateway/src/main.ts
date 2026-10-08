import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';

const DEFAULT_PORT = 3000;

function readTrustedProxyHops(): number {
  const raw = process.env['TRUST_PROXY_HOPS'];
  const hops = raw ? Number.parseInt(raw, 10) : 0;
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a non-negative integer, got "${raw}"`,
    );
  }
  return hops;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.set('trust proxy', readTrustedProxyHops());
  app.disable('x-powered-by');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  Logger.log(`api-gateway running on http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
