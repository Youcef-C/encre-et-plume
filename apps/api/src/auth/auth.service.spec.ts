import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlugService } from '../slug/slug.service';
import { EmailVerificationService } from './email-verification.service';

const MOCK_ACCOUNT = {
  id: 'cuid-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  passwordHash: '',
  role: 'utilisateur' as const,
  verified: false,
  profileSlug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date('2026-01-01'),
  emailVerifiedAt: null, // F-11: new field; null = unverified
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    account: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let slugService: { slugify: jest.Mock; ensureUniqueSlug: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let emailVerificationService: { issueToken: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    slugService = {
      slugify: jest.fn().mockReturnValue('yuki-moreau'),
      ensureUniqueSlug: jest.fn().mockResolvedValue('yuki-moreau'),
    };
    jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
    emailVerificationService = { issueToken: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: SlugService, useValue: slugService },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailVerificationService, useValue: emailVerificationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('creates account with role utilisateur and a backing Profile', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
      });

      expect(prisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'Yuki Moreau',
            email: 'yuki@test.com',
            profileSlug: 'yuki-moreau',
            profile: { create: {} }, // backing Profile row (BE-9)
          }),
        }),
      );
      // role is intentionally omitted — Prisma default applies (utilisateur)
      const createArg = (prisma.account.create as jest.Mock).mock.calls[0]?.[0];
      expect((createArg as { data: Record<string, unknown> }).data.role).toBeUndefined();
      expect(result.account.role).toBe('utilisateur');
    });

    it('does not store the plaintext password', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
      });

      const createCall = prisma.account.create.mock.calls[0]?.[0];
      expect(createCall.data.passwordHash).not.toBe('password123');
      expect(createCall.data.password).toBeUndefined();
    });

    it('throws 409 ConflictException on duplicate email', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);

      await expect(
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // ── ACID: concurrent-signup races surface as P2002 from the DB unique constraints ──

    it('maps a P2002 unique violation on email to 409 EMAIL_TAKEN (concurrent signup race)', async () => {
      const { Prisma } = await import('@prisma/client');
      prisma.account.findUnique.mockResolvedValue(null); // pre-check passed (TOCTOU window)
      prisma.account.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['email'] },
        }),
      );

      await expect(
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.account.create).toHaveBeenCalledTimes(1); // no pointless retry on email
    });

    it('retries with a fresh slug on a P2002 profileSlug collision', async () => {
      const { Prisma } = await import('@prisma/client');
      prisma.account.findUnique.mockResolvedValue(null);
      slugService.ensureUniqueSlug
        .mockResolvedValueOnce('yuki-moreau')
        .mockResolvedValueOnce('yuki-moreau-2');
      prisma.account.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['profileSlug'] },
          }),
        )
        .mockResolvedValueOnce({ ...MOCK_ACCOUNT, profileSlug: 'yuki-moreau-2' });

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
      });

      expect(prisma.account.create).toHaveBeenCalledTimes(2);
      expect(slugService.ensureUniqueSlug).toHaveBeenCalledTimes(2);
      const retryArg = prisma.account.create.mock.calls[1]?.[0] as { data: { profileSlug: string } };
      expect(retryArg.data.profileSlug).toBe('yuki-moreau-2');
      expect(result.account.slug).toBe('yuki-moreau-2');
    });

    it('rethrows non-P2002 errors from create untouched', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const dbDown = new Error('connection refused');
      prisma.account.create.mockRejectedValue(dbDown);

      await expect(
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123' }),
      ).rejects.toBe(dbDown);
    });

    it('F-11: calls emailVerificationService.issueToken after account creation (BE-3)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      await service.signup({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123' });

      expect(emailVerificationService.issueToken).toHaveBeenCalledWith({
        id: MOCK_ACCOUNT.id,
        email: MOCK_ACCOUNT.email,
        displayName: MOCK_ACCOUNT.displayName,
      });
    });

    it('F-11: signup succeeds even if issueToken throws (best-effort)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);
      emailVerificationService.issueToken.mockRejectedValue(new Error('token failure'));

      // Should not throw
      await expect(
        service.signup({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123' }),
      ).resolves.toBeDefined();
    });

    it('returns { account: AccountSummary, token: string }', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('account');
      expect(result).toHaveProperty('token');
      expect(result.account.slug).toBe('yuki-moreau');
      expect(result.account.id).toBe('cuid-1');
    });
  });

  describe('login', () => {
    it('returns { account, token } on valid credentials', async () => {
      // pre-hash a known password
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, passwordHash: hash });

      const result = await service.login({ email: 'yuki@test.com', password: 'password123' });

      expect(result.account.email).toBe('yuki@test.com');
      expect(result.token).toBe('jwt-token');
    });

    it('throws 401 UnauthorizedException on wrong password', async () => {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('correct-pass', 10);
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, passwordHash: hash });

      await expect(
        service.login({ email: 'yuki@test.com', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when email not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@test.com', password: 'any' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('returns AccountSummary for existing account', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);

      const result = await service.me('cuid-1');

      expect(result.id).toBe('cuid-1');
      expect(result.slug).toBe('yuki-moreau');
      expect(result.role).toBe('utilisateur');
    });

    it('surfaces verified:false on a fresh account (BE-AC2)', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);
      const result = await service.me('cuid-1');
      expect(result.verified).toBe(false);
    });

    it('throws 401 if account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.me('missing')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('F-6: includes preferences.theme with system default when column absent', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT); // no preferences field
      const result = await service.me('cuid-1');
      expect(result.preferences).toEqual({ theme: 'system' });
    });

    it('F-6: coerces garbage preferences value to system', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, preferences: { theme: 'bogus' } });
      const result = await service.me('cuid-1');
      expect(result.preferences).toEqual({ theme: 'system' });
    });

    it('F-6: preserves explicit dark preference from stored column', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, preferences: { theme: 'dark' } });
      const result = await service.me('cuid-1');
      expect(result.preferences).toEqual({ theme: 'dark' });
    });

    it('F-11: toSummary returns emailVerified:false when emailVerifiedAt is null (BE-4)', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, emailVerifiedAt: null });
      const result = await service.me('cuid-1');
      expect(result.emailVerified).toBe(false);
    });

    it('F-11: toSummary returns emailVerified:true when emailVerifiedAt is set (BE-4)', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, emailVerifiedAt: new Date() });
      const result = await service.me('cuid-1');
      expect(result.emailVerified).toBe(true);
    });
  });
});
