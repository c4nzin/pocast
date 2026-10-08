import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type AuthSession,
} from '@pocast/contracts';
import { importSPKI, jwtVerify } from 'jose';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { AccessTokenSigner } from '../crypto/access-token-signer';
import { PasswordHasher } from '../crypto/password-hasher';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../sessions/session.service';
import { AuthService } from './auth.service';

const testDatabaseUrl = process.env['AUTH_TEST_DATABASE_URL'];
const describeDb = testDatabaseUrl ? describe : describe.skip;
if (testDatabaseUrl) {
  process.env['AUTH_DATABASE_URL'] = testDatabaseUrl;
}

const keys = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env['AUTH_JWT_PRIVATE_KEY'] = Buffer.from(keys.privateKey).toString(
  'base64',
);
process.env['AUTH_JWT_KID'] = randomUUID();

const EMAIL = 'listener@example.com';
const OTHER_EMAIL = 'someone-else@example.com';
const PASSWORD = 'a long enough passphrase';

describeDb('AuthService (integration)', () => {
  let prisma: PrismaService;
  let sessions: SessionService;
  let auth: AuthService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const signer = new AccessTokenSigner();
    await signer.onModuleInit();
    sessions = new SessionService(prisma);
    auth = new AuthService(prisma, new PasswordHasher(), signer, sessions);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.onModuleDestroy();
  });

  const register = (): Promise<AuthSession> =>
    auth.register({ email: EMAIL, password: PASSWORD, userAgent: 'jest' });

  async function expectRpcStatus(
    promise: Promise<unknown>,
    statusCode: number,
  ) {
    await expect(promise).rejects.toMatchObject({ error: { statusCode } });
  }

  describe('register', () => {
    it('creates a listener and returns a verifiable EdDSA access token', async () => {
      const session = await register();

      expect(session.user).toMatchObject({
        email: EMAIL,
        role: 'LISTENER',
        emailVerified: false,
      });
      expect(session.tokens).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      });

      const publicKey = await importSPKI(keys.publicKey, 'EdDSA');
      const { payload, protectedHeader } = await jwtVerify(
        session.tokens.accessToken,
        publicKey,
        {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      );
      expect(payload).toMatchObject({ sub: session.user.id, role: 'LISTENER' });
      expect(protectedHeader).toMatchObject({
        alg: 'EdDSA',
        kid: process.env['AUTH_JWT_KID'],
      });
    });

    it('never stores the password or the refresh token in plain text', async () => {
      const session = await register();

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });
      const tokens = await prisma.refreshToken.findMany();
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).not.toBe(session.tokens.refreshToken);
    });

    it('rejects duplicate emails with 409', async () => {
      await register();
      await expectRpcStatus(register(), 409);
    });
  });

  describe('login', () => {
    it('succeeds with the right password and starts a new session', async () => {
      await register();

      const session = await auth.login({ email: EMAIL, password: PASSWORD });

      expect(session.user.email).toBe(EMAIL);
      await expect(prisma.refreshToken.count()).resolves.toBe(2);
    });

    it('gives the same 401 for wrong password, unknown email and disabled account', async () => {
      await register();
      await expectRpcStatus(
        auth.login({ email: EMAIL, password: 'wrong password!' }),
        401,
      );
      await expectRpcStatus(
        auth.login({ email: 'nobody@example.com', password: PASSWORD }),
        401,
      );

      await prisma.user.update({
        where: { email: EMAIL },
        data: { status: 'DISABLED' },
      });
      await expectRpcStatus(
        auth.login({ email: EMAIL, password: PASSWORD }),
        401,
      );
    });

    it('upgrades weak hashes transparently on login', async () => {
      const { hash } = await import('@node-rs/argon2');
      const weak = await hash(PASSWORD, {
        memoryCost: 4096,
        timeCost: 1,
        parallelism: 1,
      });
      await prisma.user.create({ data: { email: EMAIL, passwordHash: weak } });

      await auth.login({ email: EMAIL, password: PASSWORD });

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: EMAIL },
      });
      expect(user.passwordHash).toMatch(/\$m=19456,t=2,p=1\$/);
    });
  });

  describe('refresh rotation', () => {
    it('rotates: the new token works, the old one is retired', async () => {
      const { tokens } = await register();

      const next = await auth.refresh({ refreshToken: tokens.refreshToken });

      expect(next.refreshToken).not.toBe(tokens.refreshToken);
      await expect(
        auth.refresh({ refreshToken: next.refreshToken }),
      ).resolves.toBeDefined();
    });

    it('detects reuse of a rotated token and revokes the whole session', async () => {
      const { tokens } = await register();
      const next = await auth.refresh({ refreshToken: tokens.refreshToken });

      await expectRpcStatus(
        auth.refresh({ refreshToken: tokens.refreshToken }),
        401,
      );
      await expectRpcStatus(
        auth.refresh({ refreshToken: next.refreshToken }),
        401,
      );
    });

    it('lets exactly one of two concurrent refreshes win', async () => {
      const { tokens } = await register();

      const results = await Promise.allSettled([
        auth.refresh({ refreshToken: tokens.refreshToken }),
        auth.refresh({ refreshToken: tokens.refreshToken }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('rejects unknown, expired and disabled-user tokens', async () => {
      const { tokens } = await register();
      await expectRpcStatus(
        auth.refresh({ refreshToken: 'x'.repeat(43) }),
        401,
      );

      await prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expectRpcStatus(
        auth.refresh({ refreshToken: tokens.refreshToken }),
        401,
      );
    });
  });

  describe('logout', () => {
    it('ends that session only', async () => {
      const phone = await register();
      const laptop = await auth.login({ email: EMAIL, password: PASSWORD });

      await auth.logout(phone.tokens.refreshToken);

      await expectRpcStatus(
        auth.refresh({ refreshToken: phone.tokens.refreshToken }),
        401,
      );
      await expect(
        auth.refresh({ refreshToken: laptop.tokens.refreshToken }),
      ).resolves.toBeDefined();
    });

    it('logout everywhere ends every session', async () => {
      const phone = await register();
      const laptop = await auth.login({ email: EMAIL, password: PASSWORD });

      await auth.logoutAll(phone.user.id);

      await expectRpcStatus(
        auth.refresh({ refreshToken: phone.tokens.refreshToken }),
        401,
      );
      await expectRpcStatus(
        auth.refresh({ refreshToken: laptop.tokens.refreshToken }),
        401,
      );
    });

    it('is idempotent for unknown tokens', async () => {
      await expect(auth.logout('never-issued')).resolves.toBeUndefined();
    });
  });

  it('getUser returns the profile and 404s for unknown ids', async () => {
    const { user } = await register();

    await expect(auth.getUser(user.id)).resolves.toEqual(user);
    await expectRpcStatus(
      auth.getUser('0199b000-0000-7000-8000-000000000000'),
      404,
    );
  });

  describe('sessions', () => {
    const login = (userAgent: string, email = EMAIL): Promise<AuthSession> =>
      auth.login({ email, password: PASSWORD, userAgent });

    const registerOther = (userAgent: string): Promise<AuthSession> =>
      auth.register({ email: OTHER_EMAIL, password: PASSWORD, userAgent });

    const userAgentsOf = async (userId: string): Promise<(string | null)[]> =>
      (await sessions.listActive(userId)).map((s) => s.userAgent);

    async function sessionIdOf(userId: string, userAgent: string) {
      const match = (await sessions.listActive(userId)).find(
        (s) => s.userAgent === userAgent,
      );
      if (!match) throw new Error(`No active session for "${userAgent}"`);
      return match.id;
    }

    describe('listActive', () => {
      it('lists one entry per signed-in device', async () => {
        const { user } = await register();
        await login('laptop');

        expect((await userAgentsOf(user.id)).sort()).toEqual([
          'jest',
          'laptop',
        ]);
      });

      it('shows a session once, however often it was refreshed', async () => {
        const { user, tokens } = await register();
        let refreshToken = tokens.refreshToken;
        for (let i = 0; i < 3; i += 1) {
          ({ refreshToken } = await auth.refresh({ refreshToken }));
        }

        await expect(prisma.refreshToken.count()).resolves.toBe(4);
        await expect(sessions.listActive(user.id)).resolves.toHaveLength(1);
      });

      it('hides sessions that were logged out', async () => {
        const phone = await register();
        await login('laptop');

        await auth.logout(phone.tokens.refreshToken);

        expect(await userAgentsOf(phone.user.id)).toEqual(['laptop']);
      });

      it('hides expired sessions', async () => {
        const { user } = await register();
        await prisma.refreshToken.updateMany({
          data: { expiresAt: new Date(Date.now() - 1000) },
        });

        await expect(sessions.listActive(user.id)).resolves.toEqual([]);
      });

      it("only lists the user's own sessions", async () => {
        const me = await register();
        const other = await registerOther('other-phone');

        expect(await userAgentsOf(me.user.id)).toEqual(['jest']);
        expect(await userAgentsOf(other.user.id)).toEqual(['other-phone']);
      });

      it('returns only public fields, newest first, with ISO dates', async () => {
        const { user } = await register();
        await login('laptop');

        const [newest] = await sessions.listActive(user.id);

        expect(Object.keys(newest).sort()).toEqual([
          'expiresAt',
          'id',
          'lastActiveAt',
          'userAgent',
        ]);
        expect(newest.userAgent).toBe('laptop');
        expect(new Date(newest.lastActiveAt).toISOString()).toBe(
          newest.lastActiveAt,
        );
      });

      it('never returns more than 50 sessions', async () => {
        const { user } = await register();
        await prisma.refreshToken.createMany({
          data: Array.from({ length: 60 }, (_, i) => ({
            userId: user.id,
            familyId: randomUUID(),
            tokenHash: String(i).padStart(64, '0'),
            expiresAt: new Date(Date.now() + 60_000),
          })),
        });

        await expect(sessions.listActive(user.id)).resolves.toHaveLength(50);
      });
    });

    describe('revokeOwn', () => {
      it('ends one of my sessions and leaves the others working', async () => {
        const phone = await register();
        const laptop = await login('laptop');
        const phoneSessionId = await sessionIdOf(phone.user.id, 'jest');

        await expect(
          sessions.revokeOwn(phone.user.id, phoneSessionId),
        ).resolves.toBe(true);

        await expectRpcStatus(
          auth.refresh({ refreshToken: phone.tokens.refreshToken }),
          401,
        );
        await expect(
          auth.refresh({ refreshToken: laptop.tokens.refreshToken }),
        ).resolves.toBeDefined();
      });

      it("cannot end someone else's session (IDOR)", async () => {
        const victim = await register();
        const attacker = await registerOther('attacker');
        const victimSessionId = await sessionIdOf(victim.user.id, 'jest');

        await expect(
          sessions.revokeOwn(attacker.user.id, victimSessionId),
        ).resolves.toBe(false);

        await expect(
          auth.refresh({ refreshToken: victim.tokens.refreshToken }),
        ).resolves.toBeDefined();
      });

      it("answers 404 when revoking someone else's session through AuthService", async () => {
        const victim = await register();
        const attacker = await registerOther('attacker');
        const victimSessionId = await sessionIdOf(victim.user.id, 'jest');

        await expectRpcStatus(
          auth.revokeSession(attacker.user.id, victimSessionId),
          404,
        );
        await expectRpcStatus(
          auth.revokeSession(attacker.user.id, randomUUID()),
          404,
        );
        await expect(
          auth.revokeSession(victim.user.id, victimSessionId),
        ).resolves.toBeUndefined();
      });

      it('reports nothing ended for closed or unknown sessions', async () => {
        const { user } = await register();
        const sessionId = await sessionIdOf(user.id, 'jest');
        await sessions.revokeOwn(user.id, sessionId);

        await expect(sessions.revokeOwn(user.id, sessionId)).resolves.toBe(
          false,
        );
        await expect(sessions.revokeOwn(user.id, randomUUID())).resolves.toBe(
          false,
        );
      });
    });
  });
});
