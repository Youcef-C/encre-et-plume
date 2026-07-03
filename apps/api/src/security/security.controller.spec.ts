/**
 * D-2: Controller-level spec for SecurityController — all /me/... security routes (F-18).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { SecurityController } from './security.controller';
import { EmailChangeService } from './email-change.service';
import { PasswordChangeService } from './password-change.service';
import { TwoFactorService } from './two-factor.service';
import { SessionStore } from './session-store.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RedisService } from '../redis/redis.service';

const JWT_SECRET = 'test-secret';

describe('SecurityController — /me routes (F-18)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let emailChange: {
    request: jest.Mock;
    pendingEmailFor: jest.Mock;
  };
  let passwordChange: { change: jest.Mock };
  let twoFactor: {
    setup: jest.Mock;
    confirm: jest.Mock;
    disable: jest.Mock;
    isEnabled: jest.Mock;
  };
  let sessionStore: { list: jest.Mock; revoke: jest.Mock; reset: jest.Mock; touch: jest.Mock };
  let authService: { rotateOtherSessions: jest.Mock };
  let prismaMock: { account: { findUnique: jest.Mock } };
  let redisMock: { get: jest.Mock; set: jest.Mock; incr: jest.Mock; expire: jest.Mock; del: jest.Mock };

  beforeAll(async () => {
    emailChange = {
      request: jest.fn().mockResolvedValue({ pendingEmail: 'new@test.com' }),
      pendingEmailFor: jest.fn().mockResolvedValue(null),
    };
    passwordChange = {
      change: jest.fn().mockResolvedValue({ token: 'new-session-token', jti: 'new-jti' }),
    };
    twoFactor = {
      setup: jest.fn().mockResolvedValue({ provisioningUri: 'otpauth://totp/test', secret: 'SECRET123' }),
      confirm: jest.fn().mockResolvedValue({ backupCodes: Array.from({ length: 10 }, (_, i) => `code-${i}`) }),
      disable: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockResolvedValue(false),
    };
    sessionStore = {
      list: jest.fn().mockResolvedValue([]),
      revoke: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
      touch: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      rotateOtherSessions: jest.fn().mockResolvedValue({ token: 'rotated-token', jti: 'rotated-jti' }),
    };
    prismaMock = {
      account: { findUnique: jest.fn().mockResolvedValue({ email: 'yuki@test.com' }) },
    };
    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityController],
      providers: [
        { provide: EmailChangeService, useValue: emailChange },
        { provide: PasswordChangeService, useValue: passwordChange },
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: SessionStore, useValue: sessionStore },
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
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

  function validCookie(accountId = 'cuid-1', jti = 'test-jti'): string {
    return jwtService.sign({ sub: accountId, jti }, { expiresIn: '1h' });
  }

  // ── 401 without cookie ────────────────────────────────────────────────────────

  it('401 PATCH /me/email without cookie', async () => {
    await request(app.getHttpServer()).patch('/me/email').send({ newEmail: 'a@b.com', password: 'x' }).expect(401);
  });

  it('401 GET /me/sessions without cookie', async () => {
    await request(app.getHttpServer()).get('/me/sessions').expect(401);
  });

  it('401 GET /me/security/overview without cookie', async () => {
    await request(app.getHttpServer()).get('/me/security/overview').expect(401);
  });

  // ── PATCH /me/email ───────────────────────────────────────────────────────────

  describe('PATCH /me/email', () => {
    it('202 { pendingEmail } on success', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me/email')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ newEmail: 'new@test.com', password: 'current-pass' })
        .expect(202);

      expect(res.body.pendingEmail).toBe('new@test.com');
      expect(emailChange.request).toHaveBeenCalledWith('cuid-1', 'new@test.com', 'current-pass');
    });

    it('400 on missing newEmail', async () => {
      await request(app.getHttpServer())
        .patch('/me/email')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ password: 'current-pass' })
        .expect(400);
    });

    it('400 on invalid email format', async () => {
      await request(app.getHttpServer())
        .patch('/me/email')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ newEmail: 'not-an-email', password: 'pass' })
        .expect(400);
    });

    it('401 INVALID_PASSWORD when service throws', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      emailChange.request.mockRejectedValueOnce(
        new UnauthorizedException({ statusCode: 401, message: 'Mot de passe incorrect.', error: 'INVALID_PASSWORD' }),
      );

      const res = await request(app.getHttpServer())
        .patch('/me/email')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ newEmail: 'new@test.com', password: 'wrong' })
        .expect(401);

      expect(res.body.error).toBe('INVALID_PASSWORD');
    });
  });

  // ── PATCH /me/password ────────────────────────────────────────────────────────

  describe('PATCH /me/password', () => {
    it('200 { ok: true } + refreshes ep_session cookie', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me/password')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ currentPassword: 'old-pass', newPassword: 'new-pass123' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session='))).toBe(true);
    });

    it('400 on newPassword shorter than 8 chars', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ currentPassword: 'old', newPassword: 'short' })
        .expect(400);
    });
  });

  // ── Sessions ──────────────────────────────────────────────────────────────────

  describe('GET /me/sessions', () => {
    it('200 { sessions: [] } when no sessions in index', async () => {
      const res = await request(app.getHttpServer())
        .get('/me/sessions')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(200);

      expect(res.body).toEqual({ sessions: [] });
      // Awaited touch of the caller's own session before the read (no race with the guard)
      expect(sessionStore.touch.mock.calls[0].slice(0, 2)).toEqual(['cuid-1', 'test-jti']);
    });
  });

  describe('DELETE /me/sessions/:jti', () => {
    it('204 on success', async () => {
      await request(app.getHttpServer())
        .delete('/me/sessions/some-jti')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(204);

      expect(sessionStore.revoke).toHaveBeenCalledWith('cuid-1', 'some-jti', expect.any(Number));
    });

    it('404 SESSION_NOT_FOUND when jti unknown', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      sessionStore.revoke.mockRejectedValueOnce(
        new NotFoundException({ statusCode: 404, message: 'Session introuvable.', error: 'SESSION_NOT_FOUND' }),
      );

      const res = await request(app.getHttpServer())
        .delete('/me/sessions/ghost-jti')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(404);

      expect(res.body.error).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('DELETE /me/sessions', () => {
    it('204, bumps the session epoch, reissues the cookie, and re-indexes the new jti', async () => {
      const res = await request(app.getHttpServer())
        .delete('/me/sessions')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(204);

      expect(authService.rotateOtherSessions).toHaveBeenCalledWith('cuid-1');
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session=rotated-token'))).toBe(true);
      expect(sessionStore.reset).toHaveBeenCalledWith('cuid-1', 'rotated-jti', expect.anything());
    });
  });

  // ── 2FA ──────────────────────────────────────────────────────────────────────

  describe('POST /me/2fa/setup', () => {
    it('200 { provisioningUri, secret }', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/2fa/setup')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(200);

      expect(res.body.secret).toBeDefined();
      expect(res.body.provisioningUri).toContain('otpauth://');
    });
  });

  describe('POST /me/2fa/confirm', () => {
    it('200 { backupCodes } with 10 codes', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/2fa/confirm')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ code: '123456' })
        .expect(200);

      expect(Array.isArray(res.body.backupCodes)).toBe(true);
      expect(res.body.backupCodes).toHaveLength(10);
    });

    it('400 on missing code', async () => {
      await request(app.getHttpServer())
        .post('/me/2fa/confirm')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /me/2fa/disable', () => {
    it('200 { ok: true } on success', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/2fa/disable')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ password: 'valid-pw', code: '123456' })
        .expect(200);

      expect(res.body).toEqual({ ok: true });
      expect(twoFactor.disable).toHaveBeenCalledWith('cuid-1', 'valid-pw', '123456');
    });

    it('400 on missing password', async () => {
      await request(app.getHttpServer())
        .post('/me/2fa/disable')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ code: '123456' })
        .expect(400);
    });
  });

  // ── Security overview ─────────────────────────────────────────────────────────

  describe('GET /me/security/overview', () => {
    it('200 { twoFactorEnabled: false, pendingEmail: null }', async () => {
      const res = await request(app.getHttpServer())
        .get('/me/security/overview')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(200);

      expect(res.body).toEqual({ twoFactorEnabled: false, pendingEmail: null });
    });

    it('200 { twoFactorEnabled: true } when 2FA is on', async () => {
      twoFactor.isEnabled.mockResolvedValueOnce(true);
      emailChange.pendingEmailFor.mockResolvedValueOnce('pending@test.com');

      const res = await request(app.getHttpServer())
        .get('/me/security/overview')
        .set('Cookie', `ep_session=${validCookie()}`)
        .expect(200);

      expect(res.body).toEqual({ twoFactorEnabled: true, pendingEmail: 'pending@test.com' });
    });
  });
});
