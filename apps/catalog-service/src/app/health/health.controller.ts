import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CATALOG_PATTERNS } from '@pocast/contracts';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @MessagePattern(CATALOG_PATTERNS.HEALTH_CHECK)
  health(): Promise<{ ok: true }> {
    return this.healthService.check();
  }
}
