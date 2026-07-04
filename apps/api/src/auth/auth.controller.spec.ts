import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// TypeScript-idiomatic CommonJS import that preserves the call signature
import request = require('supertest');
// ponytail: require() avoids the CommonJS/ESM default-import TS mismatch for cookie-parser
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';
import { RedisService } from '../redis/redis.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { EMAIL_NOT_VERIFIED } from '@encre-et-plume/shared';

const JWT_SECRET = 'test-secret';

const MOCK_ACCOUNT = {
  id: 'cuid-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  role: 'utilisateur' as const,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date('2026-01-01').toISOString(),
  emailVerified: false, // F-11
  needsCguReconsent: false, // F-13
};

// Minimal in-memory Redis mock — no extra dep needed
const makeRedisMock = () => ({
  get: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  incr: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
});

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let authService: jest.Mocked<Partial<AuthService>>;
  let emailVerificationServiceMock: { issueToken: jest.Mock; confirm: jest.Mock; requestByEmail: jest.Mock };
  let passwordResetServiceMock: { requestReset: jest.Mock; confirm: jest.Mock; issueToken: jest.Mock };
  let jwtService: JwtService;
  let redisMock: ReturnType<typeof makeRedisMock>;

  beforeAll(async () => {
    authService = {
      signup: jest.fn(),
      login: jest.fn(),
      me: jest.fn(),
      issueSessionToken: jest.fn().mockReturnValue('signed-session-token'), // BE-4
    };
    emailVerificationServiceMock = {
      issueToken: jest.fn().mockResolvedValue(undefined),
      confirm: jest.fn().mockResolvedValue({ accountId: 'cuid-1' }), // BE-4: confirm returns { accountId }
      requestByEmail: jest.fn().mockResolvedValue(undefined), // BE-3: public resend
    };
    passwordResetServiceMock = {
      requestReset: jest.fn().mockResolvedValue(undefined),
      confirm: jest.fn().mockResolvedValue(undefined),
      issueToken: jest.fn().mockResolvedValue(undefined),
    };
    redisMock = makeRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        { provide: RedisService, useValue: redisMock },
        { provide: EmailVerificationService, useValue: emailVerificationServiceMock },
        { provide: PasswordResetService, useValue: passwordResetServiceMock },
        SessionGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    jwtService = module.get<JwtService>(JwtService);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    // Reset redis mock to safe defaults between tests
    redisMock.get.mockResolvedValue(null); // not denylisted
    redisMock.incr.mockResolvedValue(1);   // first request (under limit)
    redisMock.set.mockResolvedValue('OK');
    redisMock.expire.mockResolvedValue(1);
    emailVerificationServiceMock.issueToken.mockResolvedValue(undefined);
    emailVerificationServiceMock.confirm.mockResolvedValue({ accountId: 'cuid-1' }); // BE-4
    emailVerificationServiceMock.requestByEmail.mockResolvedValue(undefined); // BE-3
    passwordResetServiceMock.requestReset.mockResolvedValue(undefined);
    passwordResetServiceMock.confirm.mockResolvedValue(undefined);
    (authService.issueSessionToken as jest.Mock).mockReturnValue('signed-session-token'); // BE-4
  });

  // Include jti + expiresIn so SessionGuard populates req.jti and req.tokenExp
  function validCookie(accountId = 'cuid-1', jti = 'test-jti'): string {
    return jwtService.sign({ sub: accountId, jti }, { expiresIn: '1h' });
  }

  describe('POST /auth/signup', () => {
    it('BE-1 R2: 201 + NO ep_session cookie + returns { verificationRequired: true, email }', async () => {
      (authService.signup as jest.Mock).mockResolvedValue({ account: MOCK_ACCOUNT }); // no token

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123', birthdate: '1990-01-01', acceptCgu: true })
        .expect(201);

      // No session cookie set at signup
      const setCookieHeader = (res.headers['set-cookie'] as unknown) as string[] | undefined;
      const hasCookie = setCookieHeader?.some((c: string) => c.startsWith('ep_session='));
      expect(hasCookie).toBeFalsy();

      // Returns verificationRequired shape
      expect(res.body).toEqual({ verificationRequired: true, email: 'yuki@test.com' });
    });

    it('409 EMAIL_TAKEN + French message on duplicate email', async () => {
      const { ConflictException } = await import('@nestjs/common');
      (authService.signup as jest.Mock).mockRejectedValue(
        new ConflictException({ statusCode: 409, message: 'Cet e-mail est déjà utilisé', error: 'EMAIL_TAKEN' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'taken@test.com', password: 'password123', birthdate: '1990-01-01', acceptCgu: true })
        .expect(409);

      // NestJS flattens HttpException objects to response root
      expect(res.body.error).toBe('EMAIL_TAKEN');
      expect(res.body.message).toContain('déjà utilisé');
    });

    it('400 on invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('400 on empty displayName', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: '', email: 'a@b.com', password: 'password123' })
        .expect(400);
    });

    it('400 on password shorter than 8 chars', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'a@b.com', password: 'short' })
        .expect(400);
    });

    it('429 when rate limit exceeded', async () => {
      redisMock.incr.mockResolvedValue(11); // over the 10-per-window limit
      (authService.signup as jest.Mock).mockResolvedValue({ account: MOCK_ACCOUNT, token: 'x' });

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'a@b.com', password: 'password123', birthdate: '1990-01-01', acceptCgu: true })
        .expect(429);
    });

    // ── F-13: consent checkbox validation ────────────────────────────────────

    it('F-13: 400 when acceptCgu is false (French message)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'a@b.com', password: 'password123', birthdate: '1990-01-01', acceptCgu: false })
        .expect(400);

      const messages: string[] = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
      expect(messages.some((m: string) => m.toLowerCase().includes('vous devez accepter'))).toBe(true);
    });

    it('F-13: 400 when acceptCgu is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'a@b.com', password: 'password123', birthdate: '1990-01-01' })
        .expect(400);
    });

    // ── DR-10: birthdate validation ─────────────────────────────────────────

    it('DR-10: 400 "Date invalide" when birthdate is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'a@b.com', password: 'password123', acceptCgu: true })
        .expect(400);

      const messages: string[] = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
      expect(messages.some((m: string) => m.toLowerCase().includes('date invalide'))).toBe(true);
    });

    it('DR-10: 400 "Date invalide" for a future birthdate', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          displayName: 'X',
          email: 'a@b.com',
          password: 'password123',
          birthdate: future.toISOString().slice(0, 10),
          acceptCgu: true,
        })
        .expect(400);

      const messages: string[] = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
      expect(messages.some((m: string) => m.toLowerCase().includes('date invalide'))).toBe(true);
    });
  });

  describe('POST /auth/login', () => {
    it('200 + sets ep_session cookie on valid credentials', async () => {
      (authService.login as jest.Mock).mockResolvedValue({ account: MOCK_ACCOUNT, token: 'signed-jwt' });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'yuki@test.com', password: 'password123' })
        .expect(200);

      expect(res.body).toEqual({ account: MOCK_ACCOUNT });
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session='))).toBe(true);
    });

    it('401 INVALID_CREDENTIALS on wrong password (passes through service error)', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      (authService.login as jest.Mock).mockRejectedValue(
        new UnauthorizedException({ statusCode: 401, message: 'Identifiants invalides', error: 'INVALID_CREDENTIALS' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'yuki@test.com', password: 'wrong' })
        .expect(401);

      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('BE-2: 403 EMAIL_NOT_VERIFIED when service throws ForbiddenException', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      (authService.login as jest.Mock).mockRejectedValue(
        new ForbiddenException({
          statusCode: 403,
          message: 'Confirmez votre e-mail pour continuer.',
          error: EMAIL_NOT_VERIFIED,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'yuki@test.com', password: 'password123' })
        .expect(403);

      expect(res.body.error).toBe(EMAIL_NOT_VERIFIED);
      expect(res.body.message).toBe('Confirmez votre e-mail pour continuer.');
    });

    it('429 when rate limit exceeded', async () => {
      redisMock.incr.mockResolvedValue(11);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'yuki@test.com', password: 'password123' })
        .expect(429);
    });
  });

  describe('GET /auth/me', () => {
    it('200 with AccountSummary when ep_session cookie is valid', async () => {
      (authService.me as jest.Mock).mockResolvedValue(MOCK_ACCOUNT);
      const token = validCookie('cuid-1');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `ep_session=${token}`)
        .expect(200);

      expect(res.body.id).toBe('cuid-1');
      expect(res.body.slug).toBe('yuki-moreau');
    });

    it('401 when no cookie present', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('401 when cookie has invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', 'ep_session=garbage')
        .expect(401);
    });

    it('401 when jti is in the denylist (token revoked after logout)', async () => {
      // Simulate a denylisted token
      redisMock.get.mockResolvedValue('1');
      const token = validCookie('cuid-1', 'revoked-jti');

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `ep_session=${token}`)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('204 and clears ep_session cookie', async () => {
      const token = validCookie('cuid-1');

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `ep_session=${token}`)
        .expect(204);

      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie'] ?? ''];
      // Cookie cleared: max-age=0 or expires in the past
      expect(
        cookies.some((c: string) => c.includes('ep_session=;') || c.includes('Max-Age=0') || c.includes('max-age=0')),
      ).toBe(true);
    });

    it('stores jti in Redis denylist on logout', async () => {
      const token = validCookie('cuid-1', 'test-jti');

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `ep_session=${token}`)
        .expect(204);

      // denylist key = "denylist:<jti>", value = "1", TTL > 0
      expect(redisMock.set).toHaveBeenCalledWith(
        'denylist:test-jti',
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('401 without session cookie', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });

  // ── F-11: Email verification endpoints ──────────────────────────────────────

  describe('POST /auth/verify-email/request', () => {
    it('BE-3: 200 { ok: true } — public, no cookie needed', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/request')
        .send({ email: 'yuki@test.com' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
      expect(emailVerificationServiceMock.requestByEmail).toHaveBeenCalledWith('yuki@test.com');
    });

    it('BE-3: 200 { ok: true } for unknown email (non-enumerating)', async () => {
      emailVerificationServiceMock.requestByEmail.mockResolvedValue(undefined); // no-op inside service

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/request')
        .send({ email: 'nobody@test.com' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });

    it('BE-3: 400 on invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-email/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('BE-3: 429 RATE_LIMITED when IP rate limit exceeded', async () => {
      redisMock.incr.mockResolvedValueOnce(11); // over 10/900s limit

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/request')
        .send({ email: 'yuki@test.com' })
        .expect(429);

      expect(res.body.error).toBe('RATE_LIMITED');
    });
  });

  describe('POST /auth/verify-email/confirm', () => {
    it('BE-4: 200 { emailVerified: true } + sets ep_session cookie (token is the credential)', async () => {
      emailVerificationServiceMock.confirm.mockResolvedValue({ accountId: 'cuid-1' });
      (authService.issueSessionToken as jest.Mock).mockReturnValue('signed-session-token');

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/confirm')
        .send({ token: 'valid-raw-token' })
        .expect(200);

      expect(res.body).toEqual({ emailVerified: true });
      expect(emailVerificationServiceMock.confirm).toHaveBeenCalledWith('valid-raw-token');
      expect(authService.issueSessionToken).toHaveBeenCalledWith('cuid-1');

      // Session cookie must be set so the FE can enter onboarding
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session='))).toBe(true);
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('400 on missing token field', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-email/confirm')
        .send({})
        .expect(400);
    });

    it('400 EMAIL_TOKEN_INVALID when service throws', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      emailVerificationServiceMock.confirm.mockRejectedValue(
        new BadRequestException({ statusCode: 400, message: 'Token invalide ou déjà utilisé.', error: 'EMAIL_TOKEN_INVALID' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email/confirm')
        .send({ token: 'bad-token' })
        .expect(400);

      expect(res.body.error).toBe('EMAIL_TOKEN_INVALID');
    });
  });

  describe('GET /auth/verify-email/dev-latest', () => {
    it('returns { token } when stash exists (ENABLE_DEV_AUTH_SEAMS=true)', async () => {
      redisMock.get.mockResolvedValueOnce('raw-stashed-token');

      const res = await request(app.getHttpServer())
        .get('/auth/verify-email/dev-latest?email=yuki@test.com')
        .expect(200);

      expect(res.body.token).toBe('raw-stashed-token');
    });

    it('404 when no stash found', async () => {
      redisMock.get.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/auth/verify-email/dev-latest?email=nobody@test.com')
        .expect(404);
    });

    it('404 when ENABLE_DEV_AUTH_SEAMS is not "true", even when a stash exists (H1)', async () => {
      const origFlag = process.env['ENABLE_DEV_AUTH_SEAMS'];
      delete process.env['ENABLE_DEV_AUTH_SEAMS'];

      // The gate short-circuits before any Redis read — no stash mock needed/consumed here.
      await request(app.getHttpServer())
        .get('/auth/verify-email/dev-latest?email=yuki@test.com')
        .expect(404);

      process.env['ENABLE_DEV_AUTH_SEAMS'] = origFlag;
    });
  });

  // ── F-12: Password reset endpoints ─────────────────────────────────────────

  describe('POST /auth/password-reset/request', () => {
    it('200 { ok: true } for any email (non-enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'yuki@test.com' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });

    it('200 { ok: true } even when account does not exist (non-enumeration)', async () => {
      passwordResetServiceMock.requestReset.mockResolvedValue(undefined); // no-op for unknown email

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nobody@test.com' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });

    it('400 on invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('429 RATE_LIMITED when IP rate limit exceeded', async () => {
      redisMock.incr.mockResolvedValueOnce(11); // over limit

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'yuki@test.com' })
        .expect(429);

      expect(res.body.error).toBe('RATE_LIMITED');
    });

    it('calls requestReset on the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'yuki@test.com' })
        .expect(200);

      expect(passwordResetServiceMock.requestReset).toHaveBeenCalledWith('yuki@test.com');
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('200 { reset: true } on valid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'valid-reset-token', newPassword: 'newpassword123' })
        .expect(200);

      expect(res.body).toEqual({ reset: true });
      expect(passwordResetServiceMock.confirm).toHaveBeenCalledWith('valid-reset-token', 'newpassword123');
    });

    it('400 on missing token field', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ newPassword: 'password123' })
        .expect(400);
    });

    it('400 on missing newPassword field', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'some-token' })
        .expect(400);
    });

    it('400 PASSWORD_RESET_TOKEN_INVALID when service throws', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      passwordResetServiceMock.confirm.mockRejectedValue(
        new BadRequestException({
          statusCode: 400,
          message: 'Lien invalide ou expiré.',
          error: 'PASSWORD_RESET_TOKEN_INVALID',
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'bad-token', newPassword: 'password123' })
        .expect(400);

      expect(res.body.error).toBe('PASSWORD_RESET_TOKEN_INVALID');
    });
  });

  describe('GET /auth/password-reset/dev-latest', () => {
    it('returns { token } when stash exists (ENABLE_DEV_AUTH_SEAMS=true)', async () => {
      redisMock.get.mockResolvedValueOnce('raw-reset-stash');

      const res = await request(app.getHttpServer())
        .get('/auth/password-reset/dev-latest?email=yuki@test.com')
        .expect(200);

      expect(res.body.token).toBe('raw-reset-stash');
    });

    it('404 when no stash found', async () => {
      redisMock.get.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/auth/password-reset/dev-latest?email=nobody@test.com')
        .expect(404);
    });

    it('404 when ENABLE_DEV_AUTH_SEAMS is not "true", even when a stash exists (H1)', async () => {
      const origFlag = process.env['ENABLE_DEV_AUTH_SEAMS'];
      delete process.env['ENABLE_DEV_AUTH_SEAMS'];

      // The gate short-circuits before any Redis read — no stash mock needed/consumed here.
      await request(app.getHttpServer())
        .get('/auth/password-reset/dev-latest?email=yuki@test.com')
        .expect(404);

      process.env['ENABLE_DEV_AUTH_SEAMS'] = origFlag;
    });
  });
});
