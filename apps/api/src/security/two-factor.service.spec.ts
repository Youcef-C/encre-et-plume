/**
 * BE-6: TwoFactorService — TOTP 2FA lifecycle (setup/confirm/disable/challenge).
 */
jest.mock('bcryptjs', () => ({
  compare: jest.fn((pw: string) => Promise.resolve(pw === 'valid-password')),
}));
jest.mock('./totp.util', () => ({
  generateSecret: jest.fn().mockReturnValue('TESTSECRET123456'),
  buildProvisioningUri: jest.fn().mockReturnValue('otpauth://totp/test'),
  encryptSecret: jest.fn().mockReturnValue('iv:tag:cipher'),
  decryptSecret: jest.fn().mockReturnValue('TESTSECRET123456'),
  verifyTotp: jest.fn().mockReturnValue(true),
  generateBackupCodes: jest.fn().mockReturnValue({
    plain: Array.from({ length: 10 }, (_, i) => `code-${i}`),
    hashes: Array.from({ length: 10 }, (_, i) => `hash-${i}`),
  }),
  hashBackupCode: jest.fn((code: string) => `hash-of-${code}`),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  TWO_FACTOR_ALREADY_ENABLED,
  TWO_FACTOR_NOT_ENABLED,
  TWO_FACTOR_INVALID_CODE,
  TWO_FACTOR_CHALLENGE_INVALID,
  INVALID_PASSWORD,
} from '@encre-et-plume/shared';
import * as totpUtil from './totp.util';

const MOCK_ACCOUNT = { id: 'acc-1', email: 'user@test.com', displayName: 'Yuki', passwordHash: 'hash' };

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let prisma: {
    account: { findUnique: jest.Mock };
    twoFactorCredential: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock; incr: jest.Mock; expire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(MOCK_ACCOUNT) },
      twoFactorCredential: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    redis = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(TwoFactorService);
    // Reset mocks between tests
    (totpUtil.verifyTotp as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setup()', () => {
    it('returns provisioning URI and base32 secret; sets enabledAt=null', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(null);
      const result = await service.setup('acc-1', 'user@test.com');
      expect(result.secret).toBe('TESTSECRET123456');
      expect(result.provisioningUri).toBe('otpauth://totp/test');
      expect(prisma.twoFactorCredential.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ enabledAt: null }),
        }),
      );
    });

    it('throws TWO_FACTOR_ALREADY_ENABLED when already enabled', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue({ enabledAt: new Date() });
      await expect(service.setup('acc-1', 'user@test.com')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_ALREADY_ENABLED }),
      });
    });
  });

  describe('confirm()', () => {
    const PENDING = { id: 'cred-1', accountId: 'acc-1', secretEncrypted: 'iv:tag:cipher', enabledAt: null, backupCodeHashes: [] };

    it('throws TWO_FACTOR_NOT_ENABLED when no credential exists', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(null);
      await expect(service.confirm('acc-1', '123456')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_NOT_ENABLED }),
      });
    });

    it('throws TWO_FACTOR_INVALID_CODE on wrong code', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(PENDING);
      (totpUtil.verifyTotp as jest.Mock).mockReturnValue(false);
      await expect(service.confirm('acc-1', 'wrong')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_INVALID_CODE }),
      });
    });

    it('activates 2FA and returns 10 backup codes on success', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(PENDING);
      const result = await service.confirm('acc-1', '123456');
      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.twoFactorCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabledAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('disable()', () => {
    const ENABLED = { id: 'cred-1', accountId: 'acc-1', secretEncrypted: 'iv:tag:cipher', enabledAt: new Date(), backupCodeHashes: ['hash-of-code0'] };

    it('throws INVALID_PASSWORD on wrong password', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(ENABLED);
      await expect(service.disable('acc-1', 'wrong-pw', '123456')).rejects.toMatchObject({
        response: expect.objectContaining({ error: INVALID_PASSWORD }),
      });
    });

    it('throws TWO_FACTOR_NOT_ENABLED when 2FA is off', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(null);
      await expect(service.disable('acc-1', 'valid-password', '123456')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_NOT_ENABLED }),
      });
    });

    it('throws TWO_FACTOR_INVALID_CODE on wrong code or backup', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(ENABLED);
      (totpUtil.verifyTotp as jest.Mock).mockReturnValue(false);
      // No matching backup code
      await expect(service.disable('acc-1', 'valid-password', 'bad-code')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_INVALID_CODE }),
      });
    });

    it('deletes the credential on success', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(ENABLED);
      await service.disable('acc-1', 'valid-password', '123456');
      expect(prisma.twoFactorCredential.delete).toHaveBeenCalledWith({ where: { accountId: 'acc-1' } });
    });

    it('accepts a valid backup code (single-use)', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue(ENABLED);
      (totpUtil.verifyTotp as jest.Mock).mockReturnValue(false);
      (totpUtil.hashBackupCode as jest.Mock).mockReturnValue('hash-of-code0');
      await service.disable('acc-1', 'valid-password', 'code0');
      expect(prisma.twoFactorCredential.delete).toHaveBeenCalled();
    });
  });

  describe('challenge()', () => {
    it('stores a challenge token in Redis and returns it', async () => {
      const token = await service.challenge('acc-1', false);
      expect(typeof token).toBe('string');
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('2fa-challenge:'),
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  describe('verifyChallenge()', () => {
    it('throws TWO_FACTOR_CHALLENGE_INVALID for expired/unknown token', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.verifyChallenge('bad-token', '123456')).rejects.toMatchObject({
        response: expect.objectContaining({ error: TWO_FACTOR_CHALLENGE_INVALID }),
      });
    });

    it('returns accountId and rememberMe on valid challenge + code', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ accountId: 'acc-1', rememberMe: true }));
      prisma.twoFactorCredential.findUnique.mockResolvedValue({
        id: 'cred-1', secretEncrypted: 'iv:tag:cipher', enabledAt: new Date(), backupCodeHashes: [],
      });
      const result = await service.verifyChallenge('valid-token', '123456');
      expect(result.accountId).toBe('acc-1');
      expect(result.rememberMe).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('throws RATE_LIMITED after 5 failed attempts', async () => {
      prisma.twoFactorCredential.findUnique.mockResolvedValue({
        id: 'cred-1', secretEncrypted: 'iv:tag:cipher', enabledAt: null, backupCodeHashes: [],
      });
      (totpUtil.verifyTotp as jest.Mock).mockReturnValue(false);
      redis.incr.mockResolvedValue(6); // 6 > 5 limit
      await expect(service.confirm('acc-1', 'wrong')).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'RATE_LIMITED' }),
      });
    });

    it('verifyChallenge throws RATE_LIMITED after 5 failed attempts and burns the challenge', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ accountId: 'acc-1', rememberMe: false }));
      prisma.twoFactorCredential.findUnique.mockResolvedValue({
        id: 'cred-1', secretEncrypted: 'iv:tag:cipher', enabledAt: new Date(), backupCodeHashes: [],
      });
      (totpUtil.verifyTotp as jest.Mock).mockReturnValue(false);
      redis.incr.mockResolvedValue(6); // 6 > 5 limit
      await expect(service.verifyChallenge('some-token', 'wrong')).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'RATE_LIMITED' }),
      });
      // Challenge token must be invalidated so the attacker must redo the password login
      expect(redis.del).toHaveBeenCalledWith('2fa-challenge:some-token');
    });
  });
});
