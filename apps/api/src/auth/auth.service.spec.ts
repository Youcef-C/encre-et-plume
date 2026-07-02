import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EMAIL_NOT_VERIFIED } from '@encre-et-plume/shared';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlugService } from '../slug/slug.service';
import { EmailVerificationService } from './email-verification.service';
import { LegalService } from '../legal/legal.service';

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
  let legalService: { currentVersion: jest.Mock; needsCguReconsent: jest.Mock };

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
    legalService = {
      // F-13: default to null so existing tests don't include consents in create (defensive)
      currentVersion: jest.fn().mockResolvedValue(null),
      needsCguReconsent: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: SlugService, useValue: slugService },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailVerificationService, useValue: emailVerificationService },
        { provide: LegalService, useValue: legalService },
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
        acceptCgu: true,
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
        acceptCgu: true,
      });

      const createCall = prisma.account.create.mock.calls[0]?.[0];
      expect(createCall.data.passwordHash).not.toBe('password123');
      expect(createCall.data.password).toBeUndefined();
    });

    it('throws 409 ConflictException on duplicate email', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);

      await expect(
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123', acceptCgu: true }),
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
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123', acceptCgu: true }),
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
        acceptCgu: true,
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
        service.signup({ displayName: 'X', email: 'yuki@test.com', password: 'password123', acceptCgu: true }),
      ).rejects.toBe(dbDown);
    });

    it('F-11: calls emailVerificationService.issueToken after account creation (BE-3)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      await service.signup({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123', acceptCgu: true });

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
        service.signup({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123', acceptCgu: true }),
      ).resolves.toBeDefined();
    });

    // ── F-1 enhancement: user-chosen username (@handle) becomes profileSlug verbatim ──

    it('uses a provided username as profileSlug verbatim (no auto-generation)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({ ...MOCK_ACCOUNT, profileSlug: 'yuki-chan' });

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
        username: 'yuki-chan',
        acceptCgu: true,
      });

      const createArg = prisma.account.create.mock.calls[0]?.[0] as { data: { profileSlug: string } };
      expect(createArg.data.profileSlug).toBe('yuki-chan');
      expect(slugService.ensureUniqueSlug).not.toHaveBeenCalled();
      expect(result.account.slug).toBe('yuki-chan');
    });

    it('throws 409 USERNAME_TAKEN when the username pre-check finds an existing slug', async () => {
      // 1st findUnique: email pre-check → free; 2nd: username pre-check → taken
      prisma.account.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(MOCK_ACCOUNT);

      await expect(
        service.signup({
          displayName: 'X',
          email: 'new@test.com',
          password: 'password123',
          username: 'yuki-moreau',
          acceptCgu: true,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'USERNAME_TAKEN', statusCode: 409 }),
      });
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('throws 409 USERNAME_TAKEN on a P2002 profileSlug race for a chosen username (no silent rename)', async () => {
      const { Prisma } = await import('@prisma/client');
      prisma.account.findUnique.mockResolvedValue(null); // both pre-checks pass (TOCTOU window)
      prisma.account.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['profileSlug'] },
        }),
      );

      await expect(
        service.signup({
          displayName: 'X',
          email: 'new@test.com',
          password: 'password123',
          username: 'yuki-moreau',
          acceptCgu: true,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'USERNAME_TAKEN', statusCode: 409 }),
      });
      expect(prisma.account.create).toHaveBeenCalledTimes(1); // never retried with a regenerated slug
    });

    it('BE-1 R2: signup returns { account } only — no token (sessionless)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
        acceptCgu: true,
      });

      expect(result).toHaveProperty('account');
      expect(result).not.toHaveProperty('token'); // BE-1: no session at signup
      expect(result.account.slug).toBe('yuki-moreau');
      expect(result.account.id).toBe('cuid-1');
    });

    // ── F-13: consent records created atomically with account ─────────────────

    it('F-13: includes consent rows for cgu + privacy in account.create when versions exist', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);
      legalService.currentVersion
        .mockResolvedValueOnce('1.0') // cgu
        .mockResolvedValueOnce('1.0'); // privacy

      await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
        acceptCgu: true,
      }, '127.0.0.1');

      const createArg = prisma.account.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(createArg.data.consents).toEqual({
        create: [
          { document: 'cgu', version: '1.0', ip: '127.0.0.1' },
          { document: 'privacy', version: '1.0', ip: '127.0.0.1' },
        ],
      });
    });

    it('F-13: omits consents from account.create when no versions are published (defensive)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);
      legalService.currentVersion.mockResolvedValue(null); // no published docs

      await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
        acceptCgu: true,
      });

      const createArg = prisma.account.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(createArg.data.consents).toBeUndefined();
    });

    it('F-13: signup result has needsCguReconsent: false (default)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(MOCK_ACCOUNT);

      const result = await service.signup({
        displayName: 'Yuki Moreau',
        email: 'yuki@test.com',
        password: 'password123',
        acceptCgu: true,
      });

      expect(result.account.needsCguReconsent).toBe(false);
    });
  });

  describe('login', () => {
    it('returns { account, token } on valid credentials', async () => {
      // pre-hash a known password
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);
      // BE-2: emailVerifiedAt must be set or login will 403
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, passwordHash: hash, emailVerifiedAt: new Date() });

      const result = await service.login({ email: 'yuki@test.com', password: 'password123' });

      expect(result.account.email).toBe('yuki@test.com');
      expect(result.token).toBe('jwt-token');
    });

    it('BE-2: throws 403 ForbiddenException EMAIL_NOT_VERIFIED when emailVerifiedAt is null', async () => {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);
      // Valid credentials but unverified account (emailVerifiedAt: null)
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, passwordHash: hash, emailVerifiedAt: null });

      await expect(
        service.login({ email: 'yuki@test.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      try {
        await service.login({ email: 'yuki@test.com', password: 'password123' });
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: EMAIL_NOT_VERIFIED,
          statusCode: 403,
          message: 'Confirmez votre e-mail pour continuer.',
        });
      }
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

    it('BE-4: issueSessionToken returns a signed JWT string', () => {
      const token = (service as unknown as { issueSessionToken: (id: string) => string }).issueSessionToken('cuid-1');
      expect(typeof token).toBe('string');
      expect(token).toBe('jwt-token'); // matches jwtService.sign mock
    });

    it('F-13: login result has needsCguReconsent: false (default — live flag only on /me)', async () => {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);
      prisma.account.findUnique.mockResolvedValue({ ...MOCK_ACCOUNT, passwordHash: hash, emailVerifiedAt: new Date() });

      const result = await service.login({ email: 'yuki@test.com', password: 'password123' });

      expect(result.account.needsCguReconsent).toBe(false);
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

    it('F-13: me() returns needsCguReconsent from legalService (false when accepted)', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);
      legalService.needsCguReconsent.mockResolvedValue(false);

      const result = await service.me('cuid-1');

      expect(legalService.needsCguReconsent).toHaveBeenCalledWith('cuid-1');
      expect(result.needsCguReconsent).toBe(false);
    });

    it('F-13: me() returns needsCguReconsent: true when new cgu version is published', async () => {
      prisma.account.findUnique.mockResolvedValue(MOCK_ACCOUNT);
      legalService.needsCguReconsent.mockResolvedValue(true);

      const result = await service.me('cuid-1');

      expect(result.needsCguReconsent).toBe(true);
    });
  });
});
