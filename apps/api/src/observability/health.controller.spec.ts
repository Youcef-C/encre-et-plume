import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { ReadinessResponse } from '@encre-et-plume/shared';

describe('HealthController', () => {
  let controller: HealthController;
  const mockHealthService = { check: jest.fn() };

  beforeEach(() => {
    controller = new HealthController(mockHealthService as unknown as import('./health.service').HealthService);
    mockHealthService.check.mockReset();
  });

  it('GET /health returns { status: "ok" } unconditionally', () => {
    const result = controller.liveness();
    expect(result).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when both services are up', async () => {
    const readiness: ReadinessResponse = { status: 'ok', checks: { db: 'up', redis: 'up' } };
    mockHealthService.check.mockResolvedValue(readiness);

    const result = await controller.readiness();
    expect(result).toEqual(readiness);
  });

  it('GET /health/ready throws ServiceUnavailableException (503) when a service is down', async () => {
    const readiness: ReadinessResponse = { status: 'error', checks: { db: 'down', redis: 'up' } };
    mockHealthService.check.mockResolvedValue(readiness);

    await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
