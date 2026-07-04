import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';

function makeReq(auth?: string): Request {
  return { headers: auth ? { authorization: auth } : {} } as unknown as Request;
}

function makeRes(): Response {
  return {
    set: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
}

describe('MetricsController — /metrics auth gate (M5)', () => {
  let controller: MetricsController;
  let metricsService: { setDbUp: jest.Mock; setRedisUp: jest.Mock; expose: jest.Mock };
  let healthService: { check: jest.Mock };
  const origEnv = { ...process.env };

  beforeEach(() => {
    metricsService = {
      setDbUp: jest.fn(),
      setRedisUp: jest.fn(),
      expose: jest.fn().mockResolvedValue('# metrics'),
    };
    healthService = {
      check: jest.fn().mockResolvedValue({ status: 'ok', checks: { db: 'up', redis: 'up' } }),
    };
    controller = new MetricsController(
      metricsService as unknown as MetricsService,
      healthService as unknown as HealthService,
    );
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('production + no METRICS_TOKEN configured: refuses (never unauthenticated in prod)', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['METRICS_TOKEN'];

    await expect(controller.getMetrics(makeReq(), makeRes())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('production + METRICS_TOKEN configured + no/incorrect bearer: 401', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['METRICS_TOKEN'] = 'secret-token';

    await expect(controller.getMetrics(makeReq(), makeRes())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.getMetrics(makeReq('Bearer wrong'), makeRes())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('production + METRICS_TOKEN configured + correct bearer: serves metrics', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['METRICS_TOKEN'] = 'secret-token';
    const res = makeRes();

    await controller.getMetrics(makeReq('Bearer secret-token'), res);

    expect(metricsService.expose).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('# metrics');
  });

  it('non-production + no METRICS_TOKEN: stays open (dev/CI convenience)', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['METRICS_TOKEN'];
    const res = makeRes();

    await controller.getMetrics(makeReq(), res);

    expect(metricsService.expose).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('# metrics');
  });

  it('non-production + METRICS_TOKEN configured: still enforces the bearer check', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['METRICS_TOKEN'] = 'secret-token';

    await expect(controller.getMetrics(makeReq(), makeRes())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
