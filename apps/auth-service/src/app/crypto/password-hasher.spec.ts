import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces Argon2id hashes with the configured parameters', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hasher.hash('s3cret-password');

    await expect(hasher.verify(hash, 's3cret-password')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'S3cret-password')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('same'),
      hasher.hash('same'),
    ]);
    expect(a).not.toBe(b);
  });

  it('treats malformed hashes as a mismatch instead of throwing', async () => {
    await expect(hasher.verify('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('flags weaker or legacy hashes for upgrade', () => {
    expect(
      hasher.needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA'),
    ).toBe(true);
    expect(hasher.needsRehash('$2b$10$abcdefghijklmnopqrstuv')).toBe(true);
  });

  it('dummy verification always fails', async () => {
    await expect(hasher.verifyAgainstDummy('anything')).resolves.toBe(false);
  });
});

describe('opaque tokens', () => {
  it('are 256-bit base64url strings, unique, and hash deterministically', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(hashOpaqueToken(a)).toBe(hashOpaqueToken(a));
    expect(hashOpaqueToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
