import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JWT_AUDIENCE, JWT_ISSUER } from '@pocast/contracts';
import { importPKCS8, SignJWT } from 'jose';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { AccessTokenVerifier } from './access-token-verifier';
import { AuthGuard } from './auth.guard';

function ed25519() {
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const trusted = ed25519();
const attacker = ed25519();
const userId = randomUUID();

async function token(
  options: {
    pem?: string;
    role?: string;
    exp?: string;
    iss?: string;
    aud?: string;
  } = {},
): Promise<string> {
  const key = await importPKCS8(options.pem ?? trusted.privateKey, 'EdDSA');
  return new SignJWT({ role: options.role ?? 'LISTENER' })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(userId)
    .setIssuer(options.iss ?? JWT_ISSUER)
    .setAudience(options.aud ?? JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.exp ?? '15m')
    .sign(key);
}

function contextWith(authorization: string | undefined, roles?: string[]) {
  const request: {
    headers: Record<string, string | undefined>;
    user?: unknown;
  } = {
    headers: { authorization },
  };
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { request, reflector, context };
}

describe('AuthGuard', () => {
  const verifier = new AccessTokenVerifier();

  beforeAll(async () => {
    process.env['AUTH_JWT_PUBLIC_KEY'] = Buffer.from(
      trusted.publicKey,
    ).toString('base64');
    await verifier.onModuleInit();
  });

  async function run(authorization: string | undefined, roles?: string[]) {
    const { request, reflector, context } = contextWith(authorization, roles);
    const result = await new AuthGuard(verifier, reflector).canActivate(
      context,
    );
    return { result, request };
  }

  it('accepts a valid token and exposes the user', async () => {
    const { result, request } = await run(`Bearer ${await token()}`);

    expect(result).toBe(true);
    expect(request.user).toEqual({ userId, role: 'LISTENER' });
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['garbage', 'Bearer not-a-jwt'],
  ])('rejects %s with 401', async (_label, header) => {
    await expect(run(header)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens signed by another key', async () => {
    await expect(
      run(`Bearer ${await token({ pem: attacker.privateKey })}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    await expect(
      run(`Bearer ${await token({ exp: '-1m' })}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens for another issuer or audience', async () => {
    await expect(
      run(`Bearer ${await token({ iss: 'evil' })}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      run(`Bearer ${await token({ aud: 'other-api' })}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects alg=none and HS256 algorithm-confusion tokens', async () => {
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const claims = {
      sub: userId,
      role: 'ADMIN',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      exp: 9999999999,
      iat: 1,
    };
    const none = `${b64({ alg: 'none' })}.${b64(claims)}.x`;
    const hs256 = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(trusted.publicKey));

    await expect(run(`Bearer ${none}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(run(`Bearer ${hs256}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unknown roles in otherwise valid tokens', async () => {
    await expect(
      run(`Bearer ${await token({ role: 'SUPERUSER' })}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforces required roles with 403', async () => {
    await expect(
      run(`Bearer ${await token()}`, ['EDITOR', 'ADMIN']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { result } = await run(`Bearer ${await token({ role: 'ADMIN' })}`, [
      'EDITOR',
      'ADMIN',
    ]);
    expect(result).toBe(true);
  });
});
