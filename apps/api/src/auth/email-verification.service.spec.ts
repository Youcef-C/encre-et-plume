import { createHash } from 'crypto';
import { EmailVerificationService } from './email-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { EMAIL_TOKEN_INVALID, EMAIL_TOKEN_EXPIRED } from '@encre-et-plume/shared';

const NOW = new Date('2026-01-01T12:00:00Z');

const ACCOUNT = {
  id: 'acc-1',
  email: 'yuki@test.com',
  displayName: 'Yuki Moreau',
};

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prisma: {
    emailVerificationToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    account: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let queueService: { enqueue: jest.Mock };
  let redisService: { set: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });

    prisma = {
      emailVerificationToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      account: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    queueService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };

    service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      queueService as unknown as QueueService,
      redisService as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('issueToken', () => {
    it('creates a token row with a hashed token — raw value is not stored', async () => {
      await service.issueToken(ACCOUNT);

      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.emailVerificationToken.create.mock.calls[0][0] as {
        data: { tokenHash: string; accountId: string; expiresAt: Date };
      };

      const storedHash = createArg.data.tokenHash;
      // Must be a hex sha256 (64 chars)
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
      // stored value must NOT equal the raw token passed to QueueService
      // enqueue(queue, name, data, opts?) → data is arg index 2
      const enqueueArg = queueService.enqueue.mock.calls[0];
      const verifyUrl: string = (enqueueArg[2] as { params: { verifyUrl: string } }).params.verifyUrl;
      const rawFromUrl = new URL(verifyUrl).searchParams.get('token')!;
      // stored hash must NOT be the raw token itself
      expect(storedHash).not.toBe(rawFromUrl);
      // stored value must equal sha256(raw) — constant-time-equivalent check
      expect(storedHash).toBe(createHash('sha256').update(rawFromUrl).digest('hex'));
    });

    it('sets accountId and expiresAt = now + 24h', async () => {
      await service.issueToken(ACCOUNT);

      const createArg = prisma.emailVerificationToken.create.mock.calls[0][0] as {
        data: { accountId: string; expiresAt: Date };
      };

      expect(createArg.data.accountId).toBe('acc-1');
      const expectedExpiry = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
      expect(createArg.data.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('enqueues an email job with template=email_verification and correct params', async () => {
      await service.issueToken(ACCOUNT);

      expect(queueService.enqueue).toHaveBeenCalledTimes(1);
      const [queueName, jobName, data] = queueService.enqueue.mock.calls[0] as [
        string,
        string,
        { to: string; template: string; params: Record<string, string> },
      ];

      expect(queueName).toBe('email');
      expect(jobName).toBe('email_verification');
      expect(data.to).toBe(ACCOUNT.email);
      expect(data.template).toBe('email_verification');
      expect(data.params.displayName).toBe(ACCOUNT.displayName);
      expect(data.params.verifyUrl).toContain('/verifier-email?token=');
    });

    it('stashes the raw token in Redis under dev-email-verify:<email> (non-prod only)', async () => {
      const origEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'test';

      await service.issueToken(ACCOUNT);

      expect(redisService.set).toHaveBeenCalledWith(
        `dev-email-verify:${ACCOUNT.email}`,
        expect.any(String),
        'EX',
        3600,
      );

      process.env['NODE_ENV'] = origEnv;
    });

    it('does NOT stash in Redis in production', async () => {
      const origEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      await service.issueToken(ACCOUNT);

      const devStashCalls = redisService.set.mock.calls.filter(
        ([key]: [string]) => key.startsWith('dev-email-verify:'),
      );
      expect(devStashCalls).toHaveLength(0);

      process.env['NODE_ENV'] = origEnv;
    });

    it('does not propagate enqueue failure (best-effort)', async () => {
      queueService.enqueue.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(service.issueToken(ACCOUNT)).resolves.toBeUndefined();
    });
  });

  describe('confirm', () => {
    function makeToken(overrides: {
      consumedAt?: Date | null;
      expiresAt?: Date;
    } = {}) {
      const raw = 'test-raw-token-abc123';
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      return {
        raw,
        tokenHash,
        row: {
          id: 'tok-1',
          accountId: 'acc-1',
          tokenHash,
          expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
          consumedAt: overrides.consumedAt !== undefined ? overrides.consumedAt : null,
          createdAt: new Date(NOW.getTime() - 60_000),
        },
      };
    }

    it('sets emailVerifiedAt and consumedAt on a valid token', async () => {
      const { raw, row } = makeToken();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(row);
      prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma));
      prisma.emailVerificationToken.update.mockResolvedValue({});
      prisma.account.update.mockResolvedValue({});

      await service.confirm(raw);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws 400 EMAIL_TOKEN_EXPIRED when token is past expiresAt', async () => {
      const { raw, row } = makeToken({
        expiresAt: new Date(NOW.getTime() - 1000), // expired 1 second ago
      });
      prisma.emailVerificationToken.findUnique.mockResolvedValue(row);

      await expect(service.confirm(raw)).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_TOKEN_EXPIRED }),
        status: 400,
      });
    });

    it('throws 400 EMAIL_TOKEN_INVALID when token hash not found', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.confirm('unknown-token')).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_TOKEN_INVALID }),
        status: 400,
      });
    });

    it('throws 400 EMAIL_TOKEN_INVALID when token already consumed (single-use)', async () => {
      const { raw, row } = makeToken({
        consumedAt: new Date(NOW.getTime() - 5000), // already consumed
      });
      prisma.emailVerificationToken.findUnique.mockResolvedValue(row);

      await expect(service.confirm(raw)).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_TOKEN_INVALID }),
        status: 400,
      });
    });

    it('throws EMAIL_TOKEN_EXPIRED (distinct from INVALID) on expired — correct error code', async () => {
      const { raw, row } = makeToken({ expiresAt: new Date(NOW.getTime() - 1) });
      prisma.emailVerificationToken.findUnique.mockResolvedValue(row);

      // Verify the error code is the specific EXPIRED code, not the generic INVALID one
      await expect(service.confirm(raw)).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_TOKEN_EXPIRED }),
      });
    });
  });
});
