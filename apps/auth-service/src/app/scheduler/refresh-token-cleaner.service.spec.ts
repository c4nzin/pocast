import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenCleanerService } from './refresh-token-cleaner.service';

const BATCH_SIZE = 1000;
const MAX_BATCHES = 50;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const NOW = new Date('2025-06-01T12:00:00Z');

const idsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `id-${index}` }));

describe('RefreshTokenCleanerService', () => {
  const findMany = jest.fn();
  const deleteMany = jest.fn();
  let service: RefreshTokenCleanerService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    findMany.mockReset();
    deleteMany.mockReset();
    findMany.mockResolvedValue([]);
    deleteMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) => ({
        count: where.id.in.length,
      }),
    );
    const prisma = {
      refreshToken: { findMany, deleteMany },
    } as unknown as PrismaService;
    service = new RefreshTokenCleanerService(prisma);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('deletes 2500 expired tokens in three batches', async () => {
    findMany
      .mockResolvedValueOnce(idsOf(BATCH_SIZE))
      .mockResolvedValueOnce(idsOf(BATCH_SIZE))
      .mockResolvedValueOnce(idsOf(500));

    const total = await service.tick();

    expect(total).toBe(2500);
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(deleteMany).toHaveBeenCalledTimes(3);
  });

  it('only selects tokens that expired more than seven days ago', async () => {
    await service.tick();

    expect(findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date(NOW.getTime() - 7 * DAY_MS) } },
      select: { id: true },
      take: BATCH_SIZE,
    });
  });

  it('deletes only the ids it selected', async () => {
    findMany.mockResolvedValueOnce(idsOf(3));

    await service.tick();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-0', 'id-1', 'id-2'] } },
    });
  });

  it('does not issue a delete when nothing has expired', async () => {
    const total = await service.tick();

    expect(total).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('stops after the maximum number of batches per run', async () => {
    findMany.mockResolvedValue(idsOf(BATCH_SIZE));

    const total = await service.tick();

    expect(findMany).toHaveBeenCalledTimes(MAX_BATCHES);
    expect(total).toBe(MAX_BATCHES * BATCH_SIZE);
  });

  it('returns 0 immediately when a run is already in progress', async () => {
    let release: (rows: { id: string }[]) => void = () => undefined;
    findMany.mockReturnValueOnce(
      new Promise<{ id: string }[]>((resolve) => {
        release = resolve;
      }),
    );

    const first = service.tick();
    const second = await service.tick();
    release([]);
    await first;

    expect(second).toBe(0);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the database fails and can run again', async () => {
    findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.tick()).resolves.toBe(0);

    findMany.mockResolvedValueOnce(idsOf(2));
    await expect(service.tick()).resolves.toBe(2);
  });

  it('runs on start and then every hour until destroyed', async () => {
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(findMany).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(HOUR_MS);
    expect(findMany).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(3 * HOUR_MS);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
