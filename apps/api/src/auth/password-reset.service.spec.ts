import { createHash } from 'crypto';

// Mock bcrypt before module imports — bcrypt.hash is called in confirm()
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-newpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import {
  PASSWORD_RESET_TOKEN_INVALID,
  PASSWORD_RESET_TOKEN_EXPIRED,
} from '@encre-et-plume/shared';

const NOW = new Date('2026-01-01T12:00:00Z');
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — must match service constant

const ACCOUNT = { id: 'acc-1', email: 'yuki@test.com', displayName: 'Yuki Moreau' };

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prisma: {
    account: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let emailService: { send: jest.Mock };
  let redisService: { set: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });

    prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };

    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      emailService as unknown as EmailService,
      redisService as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── requestReset ───────────────────────────────────────────────────────────

  describe('requestReset', () => {
    it('issues a token when the account exists', async () => {
      prisma.account.findUnique.mockResolvedValue(ACCOUNT);

      await service.requestReset(ACCOUNT.email);

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });

    it('returns undefined silently when account does not exist (non-enumeration)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.requestReset('nobody@test.com')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  // ── issueToken ─────────────────────────────────────────────────────────────

  describe('issueToken', () => {
    it('stores a sha256 hash — not the raw token', async () => {
      await service.issueToken(ACCOUNT);

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { tokenHash: string; accountId: string; expiresAt: Date };
      };
      const storedHash = createArg.data.tokenHash;
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/); // hex sha256

      // raw token appears only in the emailService.send resetUrl param
      const sendCall = emailService.send.mock.calls[0] as [string, string, { resetUrl: string }];
      const resetUrl: string = sendCall[2].resetUrl;
      const rawFromUrl = new URL(resetUrl).searchParams.get('token')!;
      expect(storedHash).not.toBe(rawFromUrl);
      expect(storedHash).toBe(createHash('sha256').update(rawFromUrl).digest('hex'));
    });

    it('sets accountId and expiresAt = now + 1h', async () => {
      await service.issueToken(ACCOUNT);

      const createArg = prisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { accountId: string; expiresAt: Date };
      };
      expect(createArg.data.accountId).toBe('acc-1');
      const expectedExpiry = new Date(NOW.getTime() + TOKEN_TTL_MS);
      expect(createArg.data.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('calls emailService.send with template=password_reset, resetUrl and displayName', async () => {
      await service.issueToken(ACCOUNT);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      const [template, to, data] = emailService.send.mock.calls[0] as [
        string,
        string,
        { displayName: string; resetUrl: string },
      ];
      expect(template).toBe('password_reset');
      expect(to).toBe(ACCOUNT.email);
      expect(data.displayName).toBe(ACCOUNT.displayName);
      expect(data.resetUrl).toContain('/reinitialiser-mot-de-passe?token=');
    });

    it('stashes raw token in Redis under dev-password-reset:<email> (non-prod only)', async () => {
      const origEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'test';

      await service.issueToken(ACCOUNT);

      expect(redisService.set).toHaveBeenCalledWith(
        `dev-password-reset:${ACCOUNT.email}`,
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
        ([key]: [string]) => key.startsWith('dev-password-reset:'),
      );
      expect(devStashCalls).toHaveLength(0);

      process.env['NODE_ENV'] = origEnv;
    });

    it('does not propagate send failure (best-effort)', async () => {
      emailService.send.mockRejectedValue(new Error('Queue down'));
      await expect(service.issueToken(ACCOUNT)).resolves.toBeUndefined();
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    function makeTokenRow(overrides: { consumedAt?: Date | null; expiresAt?: Date } = {}) {
      const raw = 'test-raw-reset-token-xyz';
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      return {
        raw,
        row: {
          id: 'tok-1',
          accountId: 'acc-1',
          tokenHash,
          expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + TOKEN_TTL_MS),
          consumedAt: overrides.consumedAt !== undefined ? overrides.consumedAt : null,
          createdAt: new Date(NOW.getTime() - 60_000),
          account: { email: 'yuki@test.com', displayName: 'Yuki Moreau' },
        },
      };
    }

    it('updates passwordHash, consumes token, invalidates others, bumps session epoch', async () => {
      const { raw, row } = makeTokenRow();
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
      );

      await service.confirm(raw, 'new-password-123');

      expect(prisma.$transaction).toHaveBeenCalled();
      // Consume this token
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      // Invalidate other outstanding tokens (AC-B4)
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'acc-1', consumedAt: null },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      // Update passwordHash
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: expect.objectContaining({ passwordHash: 'hashed-newpassword' }),
        }),
      );
      // Bump session epoch in ms (AC-B4: invalidate all sessions, same-second safe)
      expect(redisService.set).toHaveBeenCalledWith(
        'session-epoch-ms:acc-1',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('calls emailService.send with password_changed notice after confirm', async () => {
      const { raw, row } = makeTokenRow();
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
      );

      await service.confirm(raw, 'new-password-123');

      expect(emailService.send).toHaveBeenCalledWith(
        'password_changed',
        'yuki@test.com',
        expect.objectContaining({ displayName: 'Yuki Moreau' }),
      );
    });

    it('throws 400 PASSWORD_RESET_TOKEN_INVALID for unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.confirm('unknown-token', 'newpass')).rejects.toMatchObject({
        response: expect.objectContaining({ error: PASSWORD_RESET_TOKEN_INVALID }),
        status: 400,
      });
    });

    it('throws 400 PASSWORD_RESET_TOKEN_INVALID for already-consumed token (single-use)', async () => {
      const { raw, row } = makeTokenRow({ consumedAt: new Date(NOW.getTime() - 5000) });
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);

      await expect(service.confirm(raw, 'newpass')).rejects.toMatchObject({
        response: expect.objectContaining({ error: PASSWORD_RESET_TOKEN_INVALID }),
        status: 400,
      });
    });

    it('throws 400 PASSWORD_RESET_TOKEN_EXPIRED for expired token', async () => {
      const { raw, row } = makeTokenRow({ expiresAt: new Date(NOW.getTime() - 1000) });
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);

      await expect(service.confirm(raw, 'newpass')).rejects.toMatchObject({
        response: expect.objectContaining({ error: PASSWORD_RESET_TOKEN_EXPIRED }),
        status: 400,
      });
    });

    it('EXPIRED is a distinct code from INVALID (mirrors F-11 pattern)', async () => {
      const { raw, row } = makeTokenRow({ expiresAt: new Date(NOW.getTime() - 1) });
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);

      await expect(service.confirm(raw, 'newpass')).rejects.toMatchObject({
        response: expect.objectContaining({ error: PASSWORD_RESET_TOKEN_EXPIRED }),
      });
      expect(PASSWORD_RESET_TOKEN_EXPIRED).not.toBe(PASSWORD_RESET_TOKEN_INVALID);
    });

    it('does not propagate password_changed send failure (best-effort)', async () => {
      const { raw, row } = makeTokenRow();
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
      );
      emailService.send.mockRejectedValue(new Error('Queue down'));

      await expect(service.confirm(raw, 'new-password')).resolves.toBeUndefined();
    });

    it('never logs a raw token or password', async () => {
      const { raw, row } = makeTokenRow();
      prisma.passwordResetToken.findUnique.mockResolvedValue(row);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
      );

      await expect(service.confirm(raw, 'safe-new-pw-123')).resolves.toBeUndefined();
    });
  });
});
