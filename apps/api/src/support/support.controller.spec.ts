import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { JwtService } from '@nestjs/jwt';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { RedisService } from '../redis/redis.service';

const JWT_SECRET = 'test-secret';

const makeRedisMock = () => ({
  getOrThrow: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
  incrOrThrow: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
});

const VALID = {
  category: 'general',
  name: 'Yuki Moreau',
  email: 'visitor@test.com',
  message: 'Bonjour, une question.',
};

describe('Support API', () => {
  let app: INestApplication;
  let serviceMock: { create: jest.Mock };
  let jwtService: JwtService;
  let redisMock: ReturnType<typeof makeRedisMock>;

  beforeAll(async () => {
    serviceMock = { create: jest.fn().mockResolvedValue(undefined) };
    redisMock = makeRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [
        { provide: SupportService, useValue: serviceMock },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
        { provide: RedisService, useValue: redisMock },
        OptionalSessionGuard,
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
    serviceMock.create.mockReset().mockResolvedValue(undefined);
    redisMock.getOrThrow.mockResolvedValue(null);
    redisMock.incrOrThrow.mockResolvedValue(1);
    redisMock.expire.mockResolvedValue(1);
  });

  function validCookie(accountId = 'acc-1', jti = 'test-jti'): string {
    return jwtService.sign({ sub: accountId, jti }, { expiresIn: '1h' });
  }

  it('200 { ok: true } on a valid visitor payload; service called with accountId undefined', async () => {
    const res = await request(app.getHttpServer()).post('/support/tickets').send(VALID).expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(serviceMock.create).toHaveBeenCalledTimes(1);
    expect(serviceMock.create.mock.calls[0][1]).toBeUndefined();
  });

  it('authenticated request → service called with the accountId from the session', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .set('Cookie', [`ep_session=${validCookie('acc-42')}`])
      .send(VALID)
      .expect(200);
    expect(serviceMock.create.mock.calls[0][1]).toBe('acc-42');
  });

  it('honeypot filled → 400, service NOT called', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...VALID, website: 'http://spam' })
      .expect(400);
    expect(serviceMock.create).not.toHaveBeenCalled();
  });

  it('6th request from same IP within window → 429', async () => {
    redisMock.incrOrThrow.mockResolvedValue(6); // over the 5/window limit
    await request(app.getHttpServer()).post('/support/tickets').send(VALID).expect(429);
    expect(serviceMock.create).not.toHaveBeenCalled();
  });

  it('per-account key is also incremented when authenticated', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .set('Cookie', [`ep_session=${validCookie('acc-99')}`])
      .send(VALID)
      .expect(200);
    const keys = redisMock.incrOrThrow.mock.calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.includes('support-acct:acc-99'))).toBe(true);
  });

  it('Redis outage during rate-limit → 429 RATE_LIMIT_UNAVAILABLE (fail closed)', async () => {
    redisMock.incrOrThrow.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app.getHttpServer()).post('/support/tickets').send(VALID).expect(429);
    expect(res.body.error).toBe('RATE_LIMIT_UNAVAILABLE');
    expect(serviceMock.create).not.toHaveBeenCalled();
  });

  it('unknown category → 400', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...VALID, category: 'nonsense' })
      .expect(400);
  });

  it('missing message → 400 "Message requis"', async () => {
    const { message, ...noMsg } = VALID;
    void message;
    const res = await request(app.getHttpServer()).post('/support/tickets').send(noMsg).expect(400);
    expect(JSON.stringify(res.body)).toContain('Message requis');
  });

  it('bad email → 400 "Adresse e-mail invalide"', async () => {
    const res = await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...VALID, email: 'not-an-email' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('Adresse e-mail invalide');
  });

  it('over-long message (>5000) → 400', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...VALID, message: 'x'.repeat(5001) })
      .expect(400);
  });

  it('whitelist strips unknown body fields (service receives no stray key)', async () => {
    await request(app.getHttpServer())
      .post('/support/tickets')
      .send({ ...VALID, hacker: 'inject', role: 'admin' })
      .expect(200);
    const dto = serviceMock.create.mock.calls[0][0] as Record<string, unknown>;
    expect(dto).not.toHaveProperty('hacker');
    expect(dto).not.toHaveProperty('role');
  });
});
