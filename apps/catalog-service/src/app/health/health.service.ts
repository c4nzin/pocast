import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async check(): Promise<{ ok: true }> {
    await this.prismaService.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
