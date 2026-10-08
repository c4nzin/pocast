import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AuthSession,
  AuthTokens,
  LoginCommand,
  RefreshCommand,
  RegisterCommand,
  type SessionSummary,
  type UserProfile,
  type UserRole,
} from '@pocast/contracts';
import { rpcError } from '@pocast/microservice-kit';
import { AccessTokenSigner } from '../crypto/access-token-signer';
import { PasswordHasher } from '../crypto/password-hasher';
import { PrismaService } from '../prisma/prisma.service';
import {
  IssuedRefreshToken,
  SessionService,
} from '../sessions/session.service';

const UNIQUE_VIOLATION = 'P2002';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

function invalidCredentials() {
  return rpcError(HttpStatus.UNAUTHORIZED, 'Invalid email or password');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly signer: AccessTokenSigner,
    private readonly sessions: SessionService,
  ) {}

  async register(command: RegisterCommand): Promise<AuthSession> {
    const passwordHash = await this.hasher.hash(command.password);
    let user: UserRow;
    try {
      user = await this.prisma.user.create({
        data: { email: command.email, passwordHash },
        select: USER_SELECT,
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw rpcError(HttpStatus.CONFLICT, 'Email is already registered');
      }
      throw error;
    }
    return this.startSession(user, command.userAgent);
  }

  async login(command: LoginCommand): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
      select: { ...USER_SELECT, passwordHash: true, status: true },
    });
    if (!user?.passwordHash) {
      await this.hasher.verifyAgainstDummy(command.password);
      throw invalidCredentials();
    }
    const valid = await this.hasher.verify(user.passwordHash, command.password);
    if (!valid || user.status !== 'ACTIVE') {
      throw invalidCredentials();
    }
    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.upgradeHash(user.id, command.password);
    }
    return this.startSession(user, command.userAgent);
  }

  async refresh(command: RefreshCommand): Promise<AuthTokens> {
    const rotated = await this.sessions.rotate(
      command.refreshToken,
      command.userAgent,
    );
    return this.tokens(rotated.userId, rotated.role, rotated);
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revoke(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAll(userId);
  }

  listSessions(userId: string): Promise<SessionSummary[]> {
    return this.sessions.listActive(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.sessions.revokeOwn(userId, sessionId);
    if (!revoked) throw rpcError(HttpStatus.NOT_FOUND, 'Session not found');
  }

  async getUser(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: USER_SELECT,
    });
    if (!user) throw rpcError(HttpStatus.NOT_FOUND, 'User not found');
    return toProfile(user);
  }

  private async startSession(
    user: UserRow,
    userAgent?: string,
  ): Promise<AuthSession> {
    const refresh = await this.sessions.issue(user.id, userAgent);
    return {
      user: toProfile(user),
      tokens: await this.tokens(user.id, user.role, refresh),
    };
  }

  private async tokens(
    userId: string,
    role: UserRole,
    refresh: IssuedRefreshToken,
  ): Promise<AuthTokens> {
    return {
      tokenType: 'Bearer',
      accessToken: await this.signer.sign(userId, role),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  private async upgradeHash(userId: string, password: string): Promise<void> {
    try {
      const passwordHash = await this.hasher.hash(password);
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Password rehash failed for ${userId}: ${(error as Error).message}`,
      );
    }
  }
}
