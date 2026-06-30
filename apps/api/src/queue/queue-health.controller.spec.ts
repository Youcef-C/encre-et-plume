// Unit tests for QueueHealthController — no Redis, no DB required.
import { Test, TestingModule } from '@nestjs/testing';
import { QueueHealthController } from './queue-health.controller';
import { QueueService } from './queue.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { QUEUE_NAMES, DEAD_LETTER_QUEUE } from '@encre-et-plume/shared';
import type { QueueHealthResponse } from '@encre-et-plume/shared';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EMPTY_COUNTS = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };

function makeCounts(overrides: Partial<typeof EMPTY_COUNTS> = {}) {
  return { ...EMPTY_COUNTS, ...overrides };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('QueueHealthController', () => {
  let controller: QueueHealthController;
  let service: { getCounts: jest.Mock };

  beforeEach(async () => {
    service = { getCounts: jest.fn().mockResolvedValue(EMPTY_COUNTS) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueHealthController],
      providers: [
        { provide: QueueService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QueueHealthController>(QueueHealthController);
  });

  // ── guard metadata ────────────────────────────────────────────────────────

  it("health() has @Roles('admin') metadata (BE-7)", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, controller.health);
    expect(roles).toEqual(['admin']);
  });

  // ── response shape ────────────────────────────────────────────────────────

  it('health() returns QueueHealthResponse with counts for all named queues (BE-7)', async () => {
    service.getCounts.mockImplementation((name: string) => {
      if (name === DEAD_LETTER_QUEUE) return Promise.resolve(makeCounts({ waiting: 3 }));
      return Promise.resolve(makeCounts({ waiting: 1, active: 2 }));
    });

    const result: QueueHealthResponse = await controller.health();

    expect(result.queues).toHaveLength(QUEUE_NAMES.length);
    expect(result.queues.map((q) => q.name)).toEqual(expect.arrayContaining([...QUEUE_NAMES]));
    // Each queue has the right shape
    result.queues.forEach((q) => {
      expect(q).toMatchObject({ name: expect.any(String), waiting: 1, active: 2, completed: 0, failed: 0, delayed: 0 });
    });
  });

  it('health() sums dead-letter queue waiting+delayed as deadLetter count (BE-7)', async () => {
    service.getCounts.mockImplementation((name: string) => {
      if (name === DEAD_LETTER_QUEUE) return Promise.resolve(makeCounts({ waiting: 4, delayed: 1 }));
      return Promise.resolve(EMPTY_COUNTS);
    });

    const result: QueueHealthResponse = await controller.health();

    expect(result.deadLetter).toBe(5); // waiting(4) + delayed(1)
  });

  it('health() includes ISO 8601 generatedAt (BE-7)', async () => {
    const result: QueueHealthResponse = await controller.health();
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('calls getCounts for each named queue and the dead-letter queue (BE-7)', async () => {
    await controller.health();

    // Called for each queue name + dead-letter
    expect(service.getCounts).toHaveBeenCalledTimes(QUEUE_NAMES.length + 1);
    for (const name of QUEUE_NAMES) {
      expect(service.getCounts).toHaveBeenCalledWith(name);
    }
    expect(service.getCounts).toHaveBeenCalledWith(DEAD_LETTER_QUEUE);
  });
});
