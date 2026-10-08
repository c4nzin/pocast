import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  REFRESH_TOKEN_TTL_DAYS,
  SessionSummary,
  type UserRole,
} from '@pocast/contracts';
import { rpcError } from '@pocast/microservice-kit';
import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken } from '../crypto/opaque-token';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_SUMMARY_SELECT, toSessionSummary } from './session-mappers';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * DAY_MS;
export const SESSION_LIST_LIMIT = 50;

export interface IssuedRefreshToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface RotatedSession extends IssuedRefreshToken {
  readonly userId: string;
  readonly role: UserRole;
}

function invalidRefreshToken() {
  return rpcError(HttpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  issue(userId: string, userAgent?: string): Promise<IssuedRefreshToken> {
    return this.createToken(userId, randomUUID(), userAgent);
  }

  async rotate(rawToken: string, userAgent?: string): Promise<RotatedSession> {
    const now = new Date();
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      select: {
        id: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        rotatedAt: true,
        user: { select: { id: true, role: true, status: true } },
      },
    });
    if (!current) throw invalidRefreshToken();

    if (current.rotatedAt) {
      await this.revokeFamily(current.familyId, now);
      this.logger.warn(
        `Refresh token reuse detected; revoked session ${current.familyId} of user ${current.user.id}`,
      );
      throw invalidRefreshToken();
    }
    if (
      current.revokedAt ||
      current.expiresAt <= now ||
      current.user.status !== 'ACTIVE'
    ) {
      throw invalidRefreshToken();
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(current.familyId, now);
      throw invalidRefreshToken();
    }

    const next = await this.createToken(
      current.user.id,
      current.familyId,
      userAgent,
    );
    return { ...next, userId: current.user.id, role: current.user.role };
  }

  async revoke(rawToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId, new Date());
  }

  async revokeAll(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async createToken(
    userId: string,
    familyId: string,
    userAgent?: string,
  ): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
    });
    return { token, expiresAt };
  }

  async listActive(userId: string): Promise<SessionSummary[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: SESSION_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: SESSION_LIST_LIMIT,
    });
    return rows.map(toSessionSummary);
  }

  async revokeOwn(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, familyId: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }
}
