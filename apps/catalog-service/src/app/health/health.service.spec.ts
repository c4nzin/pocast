import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  let service: HealthService;

  beforeEach(() => {
    queryRaw.mockReset();
    service = new HealthService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('reports ok when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toEqual({ ok: true });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates the database error instead of swallowing it', async () => {
    queryRaw.mockRejectedValue(new Error('db down'));

    await expect(service.check()).rejects.toThrow('db down');
  });
});
