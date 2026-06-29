import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// TypeScript-idiomatic CommonJS import that preserves the call signature
import request = require('supertest');
// ponytail: require() avoids the CommonJS/ESM default-import TS mismatch for cookie-parser
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';
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
  let jwtService: JwtService;
  let redisMock: ReturnType<typeof makeRedisMock>;

  beforeAll(async () => {
    authService = {
      signup: jest.fn(),
      login: jest.fn(),
      me: jest.fn(),
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
  });

  // Include jti + expiresIn so SessionGuard populates req.jti and req.tokenExp
  function validCookie(accountId = 'cuid-1', jti = 'test-jti'): string {
    return jwtService.sign({ sub: accountId, jti }, { expiresIn: '1h' });
  }

  describe('POST /auth/signup', () => {
    it('201 + sets ep_session cookie + returns AuthResponse shape', async () => {
      (authService.signup as jest.Mock).mockResolvedValue({ account: MOCK_ACCOUNT, token: 'signed-jwt' });

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'Yuki Moreau', email: 'yuki@test.com', password: 'password123' })
        .expect(201);

      expect(res.headers['set-cookie']).toBeDefined();
      const cookies: string[] = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('ep_session='))).toBe(true);
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);

      expect(res.body).toEqual({ account: MOCK_ACCOUNT });
    });

    it('409 EMAIL_TAKEN + French message on duplicate email', async () => {
      const { ConflictException } = await import('@nestjs/common');
      (authService.signup as jest.Mock).mockRejectedValue(
        new ConflictException({ statusCode: 409, message: 'Cet e-mail est déjà utilisé', error: 'EMAIL_TAKEN' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ displayName: 'X', email: 'taken@test.com', password: 'password123' })
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
        .send({ displayName: 'X', email: 'a@b.com', password: 'password123' })
        .expect(429);
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
});
