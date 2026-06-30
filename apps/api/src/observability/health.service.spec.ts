import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const mockPrisma = { $queryRaw: jest.fn() };
  const mockRedis = { ping: jest.fn() };

  beforeEach(() => {
    service = new HealthService(
      mockPrisma as unknown as import('../prisma/prisma.service').PrismaService,
      mockRedis as unknown as import('../redis/redis.service').RedisService,
    );
    mockPrisma.$queryRaw.mockReset();
    mockRedis.ping.mockReset();
  });

  it('returns ok with db:up and redis:up when both ping succeed', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedis.ping.mockResolvedValue(undefined);

    const result = await service.check();
    expect(result).toEqual({ status: 'ok', checks: { db: 'up', redis: 'up' } });
  });

  it('returns error with db:down when DB ping rejects', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB connection refused'));
    mockRedis.ping.mockResolvedValue(undefined);

    const result = await service.check();
    expect(result.status).toBe('error');
    expect(result.checks.db).toBe('down');
    expect(result.checks.redis).toBe('up');
  });

  it('returns error with redis:down when Redis ping rejects', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedis.ping.mockRejectedValue(new Error('Redis connection refused'));

    const result = await service.check();
    expect(result.status).toBe('error');
    expect(result.checks.db).toBe('up');
    expect(result.checks.redis).toBe('down');
  });

  it('returns error with both down when both ping fail', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB down'));
    mockRedis.ping.mockRejectedValue(new Error('Redis down'));

    const result = await service.check();
    expect(result.status).toBe('error');
    expect(result.checks.db).toBe('down');
    expect(result.checks.redis).toBe('down');
  });
});
