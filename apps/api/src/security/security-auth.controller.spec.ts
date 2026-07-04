/**
 * D-2: Controller-level spec for the F-18 public auth endpoints
 * (POST /auth/2fa/verify, POST /auth/email-change/confirm, GET /auth/email-change/dev-latest).
 * These live in SecurityAuthController (SecurityModule) — NOT AuthController.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
// ponytail: require() avoids the CommonJS/ESM default-import TS mismatch for cookie-parser
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { SecurityAuthController } from './security-auth.controller';
import { TwoFactorService } from './two-factor.service';
import { EmailChangeService } from './email-change.service';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';

const JWT_SECRET = 'test-secret';

const MOCK_ACCOUNT = {
  id: 'cuid-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  role: 'utilisateur' as const,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date('2026-01-01').toISOString(),
  emailVerified: false,
  needsCguReconsent: false,
};

describe('SecurityAuthController — public /auth endpoints (F-18)', () => {
  let app: INestApplication;
  let twoFactor: { verifyChallenge: jest.Mock };
  let emailChange: { confirm: jest.Mock };
  let authService: { loginByAccountId: jest.Mock };
  let redisMock: { get: jest.Mock; del: jest.Mock };

  beforeAll(async () => {
    twoFactor = { verifyChallenge: jest.fn() };
    emailChange = { confirm: jest.fn().mockResolvedValue({ emailChanged: true }) };
    authService = { loginByAccountId: jest.fn() };
    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityAuthController],
      providers: [
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: EmailChangeService, useValue: emailChange },
        { provide: AuthService, useValue: authService },
        { provide: RedisService, useValue: redisMock },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => {
    redisMock.get.mockResolvedValue(null);
    redisMock.del.mockResolvedValue(undefined);
    emailChange.confirm.mockResolvedValue({ emailChanged: true });
  });

  describe('POST /auth/2fa/verify', () => {
    it('200 + sets ep_session cookie + returns { account } on valid challenge', async () => {
      twoFactor.verifyChallenge.mockResolvedValue({ accountId: 'cuid-1', rememberMe: false });
      authService.loginByAccountId.mockResolvedValue({ account: MOCK_ACCOUNT, token: 'session-jwt' });

      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ challengeToken: 'valid-challenge', code: '123456' })
        .expect(200);

      expect(res.body.account.id).toBe('cuid-1');
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session='))).toBe(true);
    });

    it('401 TWO_FACTOR_CHALLENGE_INVALID when challenge expired', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      twoFactor.verifyChallenge.mockRejectedValue(
        new UnauthorizedException({ statusCode: 401, message: 'Challenge expiré.', error: 'TWO_FACTOR_CHALLENGE_INVALID' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ challengeToken: 'bad-token', code: '000000' })
        .expect(401);

      expect(res.body.error).toBe('TWO_FACTOR_CHALLENGE_INVALID');
    });

    it('400 on missing challengeToken', async () => {
      await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ code: '123456' })
        .expect(400);
    });

    it('sets Max-Age when rememberMe=true', async () => {
      twoFactor.verifyChallenge.mockResolvedValue({ accountId: 'cuid-1', rememberMe: true });
      authService.loginByAccountId.mockResolvedValue({ account: MOCK_ACCOUNT, token: 'jwt' });

      const res = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .send({ challengeToken: 'c', code: '123456' })
        .expect(200);

      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      // rememberMe=true → cookie has Max-Age (30d)
      expect(cookies.some((c: string) => /max-age=\d+/i.test(c))).toBe(true);
    });
  });

  describe('POST /auth/email-change/confirm', () => {
    it('200 { emailChanged: true } on valid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/email-change/confirm')
        .send({ token: 'valid-raw-token' })
        .expect(200);

      expect(res.body).toEqual({ emailChanged: true });
      expect(emailChange.confirm).toHaveBeenCalledWith('valid-raw-token');
    });

    it('400 on missing token field', async () => {
      await request(app.getHttpServer())
        .post('/auth/email-change/confirm')
        .send({})
        .expect(400);
    });

    it('400 EMAIL_CHANGE_TOKEN_INVALID when service throws', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      emailChange.confirm.mockRejectedValue(
        new BadRequestException({ statusCode: 400, message: 'Lien invalide.', error: 'EMAIL_CHANGE_TOKEN_INVALID' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/email-change/confirm')
        .send({ token: 'bad-token' })
        .expect(400);

      expect(res.body.error).toBe('EMAIL_CHANGE_TOKEN_INVALID');
    });
  });

  describe('GET /auth/email-change/dev-latest', () => {
    it('200 { token } when stash exists (ENABLE_DEV_AUTH_SEAMS=true)', async () => {
      redisMock.get.mockResolvedValueOnce('raw-change-token');

      const res = await request(app.getHttpServer())
        .get('/auth/email-change/dev-latest?email=new@test.com')
        .expect(200);

      expect(res.body.token).toBe('raw-change-token');
    });

    it('404 when no stash found', async () => {
      redisMock.get.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/auth/email-change/dev-latest?email=nobody@test.com')
        .expect(404);
    });

    it('404 when ENABLE_DEV_AUTH_SEAMS is not "true", even when a stash exists (H1)', async () => {
      const origFlag = process.env['ENABLE_DEV_AUTH_SEAMS'];
      delete process.env['ENABLE_DEV_AUTH_SEAMS'];

      // The gate short-circuits before any Redis read — no stash mock needed/consumed here.
      await request(app.getHttpServer())
        .get('/auth/email-change/dev-latest?email=new@test.com')
        .expect(404);

      process.env['ENABLE_DEV_AUTH_SEAMS'] = origFlag;
    });
  });
});
