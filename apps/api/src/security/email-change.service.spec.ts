/**
 * BE-4: EmailChangeService — password-verified email-change with token confirmation.
 */
jest.mock('bcryptjs', () => ({
  compare: jest.fn((pw: string) => Promise.resolve(pw === 'password123')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { EmailChangeService } from './email-change.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import {
  INVALID_PASSWORD,
  EMAIL_CHANGE_TOKEN_INVALID,
  EMAIL_CHANGE_TOKEN_EXPIRED,
} from '@encre-et-plume/shared';

const MOCK_ACCOUNT = {
  id: 'acc-1',
  email: 'old@test.com',
  displayName: 'Yuki',
  passwordHash: 'hashed-password', // mocked; bcrypt.compare is spied below
};

describe('EmailChangeService', () => {
  let service: EmailChangeService;
  let prisma: {
    account: { findUnique: jest.Mock; update: jest.Mock };
    emailChangeToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: { send: jest.Mock };
  let redis: { set: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn(), update: jest.fn() },
      emailChangeToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({
        emailChangeToken: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
        },
        account: { update: jest.fn().mockResolvedValue({}) },
      })),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    redis = { set: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChangeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(EmailChangeService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('request()', () => {
    it('throws INVALID_PASSWORD for wrong password', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT });
      await expect(service.request('acc-1', 'new@test.com', 'wrong')).rejects.toMatchObject({
        response: expect.objectContaining({ error: INVALID_PASSWORD }),
      });
    });

    it('throws 409 EMAIL_TAKEN when newEmail is already used', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce({ ...MOCK_ACCOUNT }) // account lookup
        .mockResolvedValueOnce({ id: 'other' });    // collision check
      await expect(service.request('acc-1', 'taken@test.com', 'password123')).rejects.toThrow(ConflictException);
    });

    it('throws 400 when newEmail equals current email', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT });
      await expect(service.request('acc-1', 'old@test.com', 'password123')).rejects.toThrow(BadRequestException);
    });

    it('creates a token and sends verification email on happy path', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce({ ...MOCK_ACCOUNT })
        .mockResolvedValueOnce(null); // no collision
      prisma.emailChangeToken.create.mockResolvedValue({});

      const result = await service.request('acc-1', 'new@test.com', 'password123');

      expect(result.pendingEmail).toBe('new@test.com');
      expect(prisma.emailChangeToken.create).toHaveBeenCalled();
      expect(emailService.send).toHaveBeenCalledWith('email_change_verification', 'new@test.com', expect.any(Object));
    });

    it('stashes the dev-latest token in Redis (non-prod)', async () => {
      prisma.account.findUnique
        .mockResolvedValueOnce({ ...MOCK_ACCOUNT })
        .mockResolvedValueOnce(null);
      prisma.emailChangeToken.create.mockResolvedValue({});
      await service.request('acc-1', 'new@test.com', 'password123');
      expect(redis.set).toHaveBeenCalledWith(
        'dev-email-change:new@test.com',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('confirm()', () => {
    const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

    it('throws EMAIL_CHANGE_TOKEN_INVALID for unknown token', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue(null);
      await expect(service.confirm('bad-token')).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_CHANGE_TOKEN_INVALID }),
      });
    });

    it('throws EMAIL_CHANGE_TOKEN_INVALID for consumed token', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        id: 't1', accountId: 'acc-1', newEmail: 'new@test.com', expiresAt: FUTURE, consumedAt: new Date(),
        account: { email: 'old@test.com', displayName: 'Yuki' },
      });
      await expect(service.confirm('some-token')).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_CHANGE_TOKEN_INVALID }),
      });
    });

    it('throws EMAIL_CHANGE_TOKEN_EXPIRED for expired token', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        id: 't1', accountId: 'acc-1', newEmail: 'new@test.com',
        expiresAt: new Date(Date.now() - 1), consumedAt: null,
        account: { email: 'old@test.com', displayName: 'Yuki' },
      });
      await expect(service.confirm('some-token')).rejects.toMatchObject({
        response: expect.objectContaining({ error: EMAIL_CHANGE_TOKEN_EXPIRED }),
      });
    });

    it('confirms the email change and sends notice to old address', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        id: 't1', accountId: 'acc-1', newEmail: 'new@test.com', expiresAt: FUTURE, consumedAt: null,
        account: { email: 'old@test.com', displayName: 'Yuki' },
      });
      prisma.account.findUnique.mockResolvedValue(null); // TOCTOU check: no collision

      const result = await service.confirm('valid-token');

      expect(result.emailChanged).toBe(true);
      expect(emailService.send).toHaveBeenCalledWith('email_change_notice', 'old@test.com', expect.any(Object));
    });

    it('throws 409 EMAIL_TAKEN on TOCTOU collision during confirm', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        id: 't1', accountId: 'acc-1', newEmail: 'taken@test.com', expiresAt: FUTURE, consumedAt: null,
        account: { email: 'old@test.com', displayName: 'Yuki' },
      });
      prisma.account.findUnique.mockResolvedValue({ id: 'other' }); // collision!

      await expect(service.confirm('valid-token')).rejects.toThrow(ConflictException);
    });
  });

  describe('pendingEmailFor()', () => {
    it('returns null when no pending token exists', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue(null);
      // ponytail: use findFirst-style mock via findUnique overload
      prisma.emailChangeToken = { ...prisma.emailChangeToken };
      (prisma.emailChangeToken as Record<string, jest.Mock>)['findFirst'] = jest.fn().mockResolvedValue(null);
      const result = await service.pendingEmailFor('acc-1');
      expect(result).toBeNull();
    });
  });
});
