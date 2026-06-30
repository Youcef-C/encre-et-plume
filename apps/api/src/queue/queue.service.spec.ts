// Unit tests for QueueService — no Redis required (bullmq + ioredis fully mocked).
jest.mock('bullmq');
jest.mock('ioredis');

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QueueService } from './queue.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let mockRedisInstance: {
  get: jest.Mock;
  set: jest.Mock;
  quit: jest.Mock;
  on: jest.Mock;
};

let mockQueueInstance: {
  add: jest.Mock;
  close: jest.Mock;
  getJobCounts: jest.Mock;
};

beforeEach(() => {
  mockRedisInstance = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
  };
  mockQueueInstance = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn().mockResolvedValue(undefined),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
  };

  (Redis as unknown as jest.Mock).mockImplementation(() => mockRedisInstance);
  (Queue as unknown as jest.Mock).mockImplementation(() => mockQueueInstance);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    service = new QueueService();
  });

  // ── enqueue ───────────────────────────────────────────────────────────────

  describe('enqueue()', () => {
    it('calls queue.add() with the job name and data (BE-2)', async () => {
      const data = { recipientId: 'u1', type: 'like' as const };
      await service.enqueue('notifications-fanout', 'notify', data);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'notify',
        data,
        expect.any(Object),
      );
    });

    it('uses default opts: attempts=3, exponential backoff delay=1000, removeOnFail=false (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {});

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnFail: false,
        }),
      );
    });

    it('sets removeOnComplete: true (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {});
      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });

    it('overrides attempts and backoffMs from opts (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {}, { attempts: 5, backoffMs: 2000 });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('sets delay when delayMs is provided (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {}, { delayMs: 5000 });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 5000 }),
      );
    });

    it('sets jobId from idempotencyKey for BullMQ dedup (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {}, { idempotencyKey: 'key-123' });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ jobId: 'key-123' }),
      );
    });

    it('creates a new Queue per queue name (lazy cache) (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {});
      await service.enqueue('notifications-fanout', 'notify', {}); // second call same queue

      // Queue constructor called only once for the same name
      expect(Queue).toHaveBeenCalledTimes(1);
    });

    it('creates separate Queue instances for different queue names (BE-2)', async () => {
      await service.enqueue('notifications-fanout', 'notify', {});
      await service.enqueue('email', 'send', {});

      expect(Queue).toHaveBeenCalledTimes(2);
    });
  });

  // ── schedule ──────────────────────────────────────────────────────────────

  describe('schedule()', () => {
    it('calls queue.add() with the repeat cron pattern (BE-2)', async () => {
      await service.schedule('email', 'cleanup', {}, { pattern: '0 0 * * *' });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'cleanup',
        {},
        expect.objectContaining({ repeat: { pattern: '0 0 * * *' } }),
      );
    });
  });

  // ── idempotency helpers ───────────────────────────────────────────────────

  describe('isProcessed() / markProcessed()', () => {
    it('isProcessed returns false when key is absent (BE-2)', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      expect(await service.isProcessed('key-1')).toBe(false);
      expect(mockRedisInstance.get).toHaveBeenCalledWith('idempotency:key-1');
    });

    it('isProcessed returns true when key exists (BE-2)', async () => {
      mockRedisInstance.get.mockResolvedValue('1');
      expect(await service.isProcessed('key-1')).toBe(true);
    });

    it('markProcessed sets key with 7-day TTL (BE-2)', async () => {
      await service.markProcessed('key-1');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'idempotency:key-1',
        '1',
        'EX',
        60 * 60 * 24 * 7,
      );
    });
  });

  // ── getCounts ─────────────────────────────────────────────────────────────

  describe('getCounts()', () => {
    it('delegates to queue.getJobCounts with all relevant states (BE-7)', async () => {
      const expected = { waiting: 2, active: 1, completed: 5, failed: 0, delayed: 0 };
      mockQueueInstance.getJobCounts.mockResolvedValue(expected);

      const result = await service.getCounts('notifications-fanout');

      expect(mockQueueInstance.getJobCounts).toHaveBeenCalledWith(
        'waiting', 'active', 'completed', 'failed', 'delayed',
      );
      expect(result).toEqual(expected);
    });
  });

  // ── onModuleDestroy ───────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('closes all cached Queue instances and the Redis connection (BE-2)', async () => {
      // Trigger queue creation
      await service.enqueue('notifications-fanout', 'notify', {});
      await service.enqueue('email', 'send', {});

      await service.onModuleDestroy();

      expect(mockQueueInstance.close).toHaveBeenCalledTimes(2);
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });
  });
});
