import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from '@encre-et-plume/shared';
import { HealthService } from './health.service';

/** No auth — liveness/readiness probes are for LB/orchestrators, not users. */
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  liveness(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async readiness(): Promise<ReadinessResponse> {
    const result = await this.healthService.check();
    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
