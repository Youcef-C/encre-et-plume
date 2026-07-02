import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
// ponytail: require() avoids the CommonJS/ESM default-import TS mismatch for cookie-parser
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RedisService } from '../redis/redis.service';
import { LEGAL_VERSION_UNKNOWN } from '@encre-et-plume/shared';
import { BadRequestException } from '@nestjs/common';

const JWT_SECRET = 'test-secret';

const DOC_CGU = {
  kind: 'cgu' as const,
  version: '1.0',
  content: '<h1>CGU</h1>',
  publishedAt: '2026-01-01T00:00:00.000Z',
};

describe('LegalController (HTTP)', () => {
  let app: INestApplication;
  let legalService: {
    getCurrent: jest.Mock;
    currentVersion: jest.Mock;
    isPublishedVersion: jest.Mock;
    recordConsent: jest.Mock;
    needsCguReconsent: jest.Mock;
  };
  let redisMock: { get: jest.Mock; set: jest.Mock; incr: jest.Mock; expire: jest.Mock };
  let jwtService: JwtService;

  beforeAll(async () => {
    legalService = {
      getCurrent: jest.fn(),
      currentVersion: jest.fn(),
      isPublishedVersion: jest.fn(),
      recordConsent: jest.fn(),
      needsCguReconsent: jest.fn(),
    };
    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalController],
      providers: [
        { provide: LegalService, useValue: legalService },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
        { provide: RedisService, useValue: redisMock },
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
    legalService.getCurrent.mockReset();
    legalService.recordConsent.mockReset();
    redisMock.get.mockResolvedValue(null);
    redisMock.incr.mockResolvedValue(1);
  });

  function validCookie(accountId = 'acc-1'): string {
    return jwtService.sign({ sub: accountId, jti: 'test-jti' }, { expiresIn: '1h' });
  }

  // ── GET /legal/:kind ─────────────────────────────────────────────────────────

  describe('GET /legal/:kind', () => {
    it('BE-3: 200 + { kind, version, content, publishedAt } for a valid kind', async () => {
      legalService.getCurrent.mockResolvedValue(DOC_CGU);

      const res = await request(app.getHttpServer()).get('/legal/cgu').expect(200);

      expect(res.body).toEqual(DOC_CGU);
      expect(legalService.getCurrent).toHaveBeenCalledWith('cgu');
    });

    it('BE-3: 200 for privacy kind', async () => {
      legalService.getCurrent.mockResolvedValue({ ...DOC_CGU, kind: 'privacy' });

      await request(app.getHttpServer()).get('/legal/privacy').expect(200);

      expect(legalService.getCurrent).toHaveBeenCalledWith('privacy');
    });

    it('BE-3: 200 for mentions kind', async () => {
      legalService.getCurrent.mockResolvedValue({ ...DOC_CGU, kind: 'mentions' });

      await request(app.getHttpServer()).get('/legal/mentions').expect(200);

      expect(legalService.getCurrent).toHaveBeenCalledWith('mentions');
    });

    it('BE-6: 404 for an unknown kind (e.g. "cookies")', async () => {
      await request(app.getHttpServer()).get('/legal/cookies').expect(404);

      expect(legalService.getCurrent).not.toHaveBeenCalled();
    });

    it('BE-6: 404 for an unknown kind (empty slug variant)', async () => {
      await request(app.getHttpServer()).get('/legal/unknown').expect(404);
    });

    it('passes through NotFoundException from service (no document published)', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      legalService.getCurrent.mockRejectedValue(new NotFoundException());

      await request(app.getHttpServer()).get('/legal/cgu').expect(404);
    });

    it('BE-7: public route — no cookie required', async () => {
      legalService.getCurrent.mockResolvedValue(DOC_CGU);

      // No Cookie header → still 200
      await request(app.getHttpServer()).get('/legal/cgu').expect(200);
    });
  });

  // ── POST /consents ────────────────────────────────────────────────────────────

  describe('POST /consents', () => {
    it('BE-7: 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/consents')
        .send({ document: 'cgu', version: '1.0' })
        .expect(401);
    });

    it('BE-4: 201 { recorded: true } when authenticated with a published version', async () => {
      legalService.recordConsent.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/consents')
        .set('Cookie', `ep_session=${validCookie('acc-1')}`)
        .send({ document: 'cgu', version: '1.0' })
        .expect(201);

      expect(res.body).toEqual({ recorded: true });
      expect(legalService.recordConsent).toHaveBeenCalledWith('acc-1', 'cgu', '1.0', expect.any(String));
    });

    it('BE-6: 400 LEGAL_VERSION_UNKNOWN when service rejects an unpublished version', async () => {
      legalService.recordConsent.mockRejectedValue(
        new BadRequestException({
          statusCode: 400,
          message: 'Version inconnue ou non publiée.',
          error: LEGAL_VERSION_UNKNOWN,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/consents')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ document: 'cgu', version: '9.9' })
        .expect(400);

      expect(res.body.error).toBe(LEGAL_VERSION_UNKNOWN);
    });

    it('BE-6: 400 when document is not a valid enum value', async () => {
      await request(app.getHttpServer())
        .post('/consents')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ document: 'cookies', version: '1.0' })
        .expect(400);
    });

    it('BE-6: 400 when version is missing', async () => {
      await request(app.getHttpServer())
        .post('/consents')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ document: 'cgu' })
        .expect(400);
    });

    it('BE-6: 400 when document is missing', async () => {
      await request(app.getHttpServer())
        .post('/consents')
        .set('Cookie', `ep_session=${validCookie()}`)
        .send({ version: '1.0' })
        .expect(400);
    });
  });
});
