import { Controller } from '@nestjs/common';
import { HealthService } from './health.service';
import { MessagePattern } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@pocast/contracts';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @MessagePattern(AUTH_PATTERNS.HEALTH_CHECK)
  check(): Promise<{ ok: true }> {
    return this.healthService.check();
  }
}
