import { Injectable } from '@nestjs/common';
import { type Algorithm, hash, verify } from '@node-rs/argon2';

const ARGON2ID = 2 as Algorithm;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const EXPECTED_PARAMS = `m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`;

@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalization');
    await this.verify(await this.dummyHash, password);
    return false;
  }

  needsRehash(passwordHash: string): boolean {
    return (
      !passwordHash.startsWith('$argon2id$') ||
      !passwordHash.includes(`$${EXPECTED_PARAMS}$`)
    );
  }
}
