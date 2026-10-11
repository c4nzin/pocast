import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import {
  AUTH_PATTERNS,
  AUTH_SERVICE,
  CATALOG_PATTERNS,
  CATALOG_SERVICE,
  CREATOR_PATTERNS,
  CREATOR_SERVICE,
  DependencyState,
  LIBRARY_PATTERNS,
  LIBRARY_SERVICE,
  ReadinessReport,
} from '@pocast/contracts';
import { sendRpc } from './common/send-rpc';

const READINESS_TIMEOUT_MS = 2000;

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalogClient: ClientProxy,
    @Inject(AUTH_SERVICE) private readonly authClient: ClientProxy,
    @Inject(LIBRARY_SERVICE) private readonly libraryClient: ClientProxy,
    @Inject(CREATOR_SERVICE) private readonly creatorClient: ClientProxy,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(): Promise<ReadinessReport> {
    const [catalog, auth, library, creator] = await Promise.all([
      this.probe(this.catalogClient, CATALOG_PATTERNS.HEALTH_CHECK),
      this.probe(this.authClient, AUTH_PATTERNS.HEALTH_CHECK),
      this.probe(this.libraryClient, LIBRARY_PATTERNS.HEALTH_CHECK),
      this.probe(this.creatorClient, CREATOR_PATTERNS.HEALTH_CHECK),
    ]);

    const services: ReadinessReport['services'] = {
      catalog,
      auth,
      library,
      creator,
    };
    const isReady = Object.values(services).every((state) => state === 'up');
    const report: ReadinessReport = {
      status: isReady ? 'ok' : 'degraded',
      services,
    };

    if (!isReady) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }

  private async probe(
    client: ClientProxy,
    pattern: string,
  ): Promise<DependencyState> {
    try {
      await sendRpc(client, pattern, {}, READINESS_TIMEOUT_MS);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
