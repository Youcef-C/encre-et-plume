import { Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';

/**
 * Prometheus metrics exposition endpoint.
 * Network-gated in prod; optional METRICS_TOKEN bearer gate for shared networks.
 * ponytail: no session/role guard — Prometheus scrapers don't carry session cookies.
 */
@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly healthService: HealthService,
  ) {}

  @Get('metrics')
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = process.env['METRICS_TOKEN'];
    if (token) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${token}`) {
        throw new UnauthorizedException();
      }
    }

    // Refresh db/redis up gauges at scrape time
    const health = await this.healthService.check();
    this.metricsService.setDbUp(health.checks.db === 'up');
    this.metricsService.setRedisUp(health.checks.redis === 'up');

    const body = await this.metricsService.expose();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(body);
  }
}
