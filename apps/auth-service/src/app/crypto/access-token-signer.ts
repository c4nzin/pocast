import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type UserRole,
} from '@pocast/contracts';
import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

type SigningKey = Awaited<ReturnType<typeof importPKCS8>>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set (run tools/scripts/generate-jwt-keys.mjs)`,
    );
  }
  return value;
}

@Injectable()
export class AccessTokenSigner implements OnModuleInit {
  private key: SigningKey | null = null;
  private keyId = '';

  async onModuleInit(): Promise<void> {
    const pem = Buffer.from(
      requireEnv('AUTH_JWT_PRIVATE_KEY'),
      'base64',
    ).toString('utf8');
    this.key = await importPKCS8(pem, JWT_ALGORITHM);
    this.keyId = requireEnv('AUTH_JWT_KID');
  }

  async sign(userId: string, role: UserRole): Promise<string> {
    if (!this.key) throw new Error('AccessTokenSigner used before init');
    return new SignJWT({ role })
      .setProtectedHeader({ alg: JWT_ALGORITHM, kid: this.keyId, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .setJti(randomUUID())
      .sign(this.key);
  }
}
