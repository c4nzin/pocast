import { HttpStatus } from '@nestjs/common';
import { AccessTokenSigner } from '../crypto/access-token-signer';
import { PasswordHasher } from '../crypto/password-hasher';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../sessions/session.service';
import { AuthService } from './auth.service';

const USER_ID = '0191a000-0000-7000-8000-000000000001';
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';
const OLD_HASH = 'old-hash';
const NEW_HASH = 'new-hash';

const userRow = {
  id: USER_ID,
  email: 'user@example.com',
  role: 'LISTENER',
  passwordHash: OLD_HASH,
  status: 'ACTIVE',
  emailVerifiedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

describe('AuthService.changePassword', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const verify = jest.fn();
  const hash = jest.fn();
  const revokeAll = jest.fn();
  const transaction = jest.fn();
  const issue = jest.fn();
  const sign = jest.fn();
  let service: AuthService;

  const txClient = { user: { update } };

  const command = {
    userId: USER_ID,
    oldPassword: OLD_PASSWORD,
    newPassword: NEW_PASSWORD,
    userAgent: 'jest',
  };

  beforeEach(() => {
    [
      findUnique,
      update,
      verify,
      hash,
      revokeAll,
      transaction,
      issue,
      sign,
    ].forEach((fn) => fn.mockReset());
    findUnique.mockResolvedValue(userRow);
    verify.mockResolvedValue(true);
    hash.mockResolvedValue(NEW_HASH);
    update.mockResolvedValue({});
    revokeAll.mockResolvedValue(2);
    transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback(txClient),
    );
    issue.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: new Date('2025-02-01T00:00:00Z'),
    });
    sign.mockResolvedValue('access-token');

    service = new AuthService(
      {
        user: { findUnique },
        $transaction: transaction,
      } as unknown as PrismaService,
      { verify, hash } as unknown as PasswordHasher,
      { sign } as unknown as AccessTokenSigner,
      { issue, revokeAll } as unknown as SessionService,
    );
  });

  it('stores the new hash, revokes old sessions and returns a fresh session', async () => {
    const result = await service.changePassword(command);

    expect(hash).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(update).toHaveBeenCalledWith({
      data: { passwordHash: NEW_HASH },
      where: { id: USER_ID },
    });
    expect(revokeAll).toHaveBeenCalledWith(USER_ID, txClient);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledWith(USER_ID, 'jest');
    expect(result.tokens.accessToken).toBe('access-token');
    expect(result.tokens.refreshToken).toBe('refresh-token');
    expect(result.user.id).toBe(USER_ID);
  });

  it('commits the password change and revocation before issuing the new session', async () => {
    const order: string[] = [];
    transaction.mockImplementation(async () => {
      order.push('transaction');
    });
    issue.mockImplementation(async () => {
      order.push('issue');
      return { token: 't', expiresAt: new Date() };
    });

    await service.changePassword(command);

    expect(order).toEqual(['transaction', 'issue']);
  });

  it('does not issue a session when the transaction fails', async () => {
    transaction.mockRejectedValue(new Error('db down'));

    await expect(service.changePassword(command)).rejects.toThrow('db down');

    expect(issue).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password without changing anything', async () => {
    verify.mockResolvedValue(false);

    await expect(service.changePassword(command)).rejects.toMatchObject({
      error: { statusCode: HttpStatus.UNAUTHORIZED },
    });

    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the current one', async () => {
    await expect(
      service.changePassword({ ...command, newPassword: OLD_PASSWORD }),
    ).rejects.toMatchObject({
      error: { statusCode: HttpStatus.BAD_REQUEST },
    });

    expect(hash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects when the user does not exist or is inactive', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.changePassword(command)).rejects.toMatchObject({
      error: { statusCode: HttpStatus.UNAUTHORIZED },
    });

    expect(verify).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an account that has no password set', async () => {
    findUnique.mockResolvedValue({ ...userRow, passwordHash: null });

    await expect(service.changePassword(command)).rejects.toMatchObject({
      error: { statusCode: HttpStatus.UNAUTHORIZED },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('only looks up active users with a password', async () => {
    await service.changePassword(command);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id: USER_ID,
        status: 'ACTIVE',
        passwordHash: { not: null },
      },
    });
  });
});
