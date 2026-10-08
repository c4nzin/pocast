import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  USER_ROLES,
  type UserRole,
} from '@pocast/contracts';
import { importSPKI, jwtVerify } from 'jose';

type VerificationKey = Awaited<ReturnType<typeof importSPKI>>;

const CLOCK_TOLERANCE_SECONDS = 5;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthenticatedUser {
  readonly userId: string;
  readonly role: UserRole;
}

@Injectable()
export class AccessTokenVerifier implements OnModuleInit {
  private key: VerificationKey | null = null;

  async onModuleInit(): Promise<void> {
    const encoded = process.env['AUTH_JWT_PUBLIC_KEY'];
    if (!encoded) {
      throw new Error(
        'AUTH_JWT_PUBLIC_KEY is not set (run tools/scripts/generate-jwt-keys.mjs)',
      );
    }
    this.key = await importSPKI(
      Buffer.from(encoded, 'base64').toString('utf8'),
      JWT_ALGORITHM,
    );
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    if (!this.key) throw new Error('AccessTokenVerifier used before init');
    const { payload } = await jwtVerify(token, this.key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALGORITHM],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    const role = payload['role'];
    if (
      typeof payload.sub !== 'string' ||
      !UUID_PATTERN.test(payload.sub) ||
      typeof role !== 'string' ||
      !(USER_ROLES as readonly string[]).includes(role)
    ) {
      throw new Error('Malformed access token claims');
    }
    return { userId: payload.sub, role: role as UserRole };
  }
}
