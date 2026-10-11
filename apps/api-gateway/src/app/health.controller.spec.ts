import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  CATALOG_PATTERNS,
  CREATOR_PATTERNS,
  LIBRARY_PATTERNS,
} from '@pocast/contracts';
import { NEVER, of, throwError } from 'rxjs';
import { HealthController } from './health.controller';

const READINESS_TIMEOUT_MS = 2000;

type ServiceName = 'catalog' | 'auth' | 'library' | 'creator';

describe('HealthController', () => {
  const sends: Record<ServiceName, jest.Mock> = {
    catalog: jest.fn(),
    auth: jest.fn(),
    library: jest.fn(),
    creator: jest.fn(),
  };
  let controller: HealthController;

  const allUp = { catalog: 'up', auth: 'up', library: 'up', creator: 'up' };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    Object.values(sends).forEach((send) => {
      send.mockReset();
      send.mockReturnValue(of({ ok: true }));
    });
    const client = (name: ServiceName) =>
      ({ send: sends[name] }) as unknown as ClientProxy;
    controller = new HealthController(
      client('catalog'),
      client('auth'),
      client('library'),
      client('creator'),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function readinessFailure(): Promise<ServiceUnavailableException> {
    const call = controller.ready().catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);
    return (await call) as ServiceUnavailableException;
  }

  it('liveness answers ok without contacting any service', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
    Object.values(sends).forEach((send) => expect(send).not.toHaveBeenCalled());
  });

  it('reports ok when all four services answer', async () => {
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      services: allUp,
    });
  });

  it('sends each health pattern to the matching service', async () => {
    await controller.ready();

    expect(sends.catalog).toHaveBeenCalledWith(
      CATALOG_PATTERNS.HEALTH_CHECK,
      {},
    );
    expect(sends.auth).toHaveBeenCalledWith(AUTH_PATTERNS.HEALTH_CHECK, {});
    expect(sends.library).toHaveBeenCalledWith(
      LIBRARY_PATTERNS.HEALTH_CHECK,
      {},
    );
    expect(sends.creator).toHaveBeenCalledWith(
      CREATOR_PATTERNS.HEALTH_CHECK,
      {},
    );
  });

  it.each<ServiceName>(['catalog', 'auth', 'library', 'creator'])(
    'returns 503 with only %s down when it fails',
    async (name) => {
      sends[name].mockReturnValue(throwError(() => new Error('db down')));

      const error = await readinessFailure();

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toEqual({
        status: 'degraded',
        services: { ...allUp, [name]: 'down' },
      });
    },
  );

  it('marks a silent service down once the timeout elapses', async () => {
    sends.library.mockReturnValue(NEVER);

    const error = await readinessFailure();

    expect(error.getResponse()).toEqual({
      status: 'degraded',
      services: { ...allUp, library: 'down' },
    });
  });

  it('reports every failing service, not just the first', async () => {
    sends.catalog.mockReturnValue(throwError(() => new Error('x')));
    sends.creator.mockReturnValue(NEVER);

    const error = await readinessFailure();

    expect(error.getResponse()).toEqual({
      status: 'degraded',
      services: { ...allUp, catalog: 'down', creator: 'down' },
    });
  });

  it('checks all services in parallel within a single timeout', async () => {
    Object.values(sends).forEach((send) => send.mockReturnValue(NEVER));
    let settled = false;
    const call = controller
      .ready()
      .catch((error: unknown) => error)
      .then(() => {
        settled = true;
      });

    await jest.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);
    await call;

    expect(settled).toBe(true);
  });

  it('does not leak error details in the response', async () => {
    sends.catalog.mockReturnValue(
      throwError(() => new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    );

    const error = await readinessFailure();

    expect(JSON.stringify(error.getResponse())).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(error.getResponse())).not.toContain('10.0.0.5');
  });
});
