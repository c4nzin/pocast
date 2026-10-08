import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const DEFAULT_POOL_MAX = 10;

function readDatabaseUrl(): string {
  const url = process.env['AUTH_DATABASE_URL'];
  if (!url) {
    throw new Error('AUTH_DATABASE_URL is not set');
  }
  return url;
}

function readPoolMax(): number {
  const raw = process.env['AUTH_DB_POOL_MAX'];
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_POOL_MAX;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `AUTH_DB_POOL_MAX must be a positive integer, got "${raw}"`,
    );
  }
  return parsed;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: readDatabaseUrl(),
        max: readPoolMax(),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to auth database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
