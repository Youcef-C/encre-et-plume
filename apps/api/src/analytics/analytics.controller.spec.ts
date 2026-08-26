import { Test } from '@nestjs/testing';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { RedisService } from '../redis/redis.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

const SALT_KEY = 'analytics:salt:2026-08-26';

function makeRedis(down = false) {
  const store = new Map<string, string>([[SALT_KEY, 'salt-a']]);
  return {
    get: jest.fn(async (k: string) => (down ? null : (store.get(k) ?? null))),
    setNx: jest.fn(async () => !down),
    rpush: down
      ? jest.fn(async () => {
          throw new Error('ECONNREFUSED');
        })
      : jest.fn(async () => 1),
    ltrim: jest.fn(async () => undefined),
  };
}

async function build(down = false) {
  const redis = makeRedis(down);
  const moduleRef = await Test.createTestingModule({
    controllers: [AnalyticsController],
    providers: [AnalyticsService, { provide: RedisService, useValue: redis }],
  })
    .overrideGuard(OptionalSessionGuard)
    .useValue({ canActivate: () => true })
    .compile();

  return { controller: moduleRef.get(AnalyticsController), redis };
}

function req(overrides: Partial<{ ua: string; ip: string; accountId: string }> = {}): AuthRequest {
  return {
    ip: overrides.ip ?? '203.0.113.7',
    headers: { 'user-agent': 'ua' in overrides ? overrides.ua : 'Mozilla/5.0 (Macintosh)' },
    accountId: overrides.accountId,
  } as unknown as AuthRequest;
}

/** The JSON pushed to `analytics:buffer` by the last accepted event. */
function pushed(redis: ReturnType<typeof makeRedis>) {
  const call = redis.rpush.mock.calls.at(-1) as unknown as [string, string];
  return { key: call[0], event: JSON.parse(call[1]) as Record<string, unknown> };
}

describe('AnalyticsController — POST /events (F-23 B7)', () => {
  it('buffers a visit and returns no body', async () => {
    const { controller, redis } = await build();

    await expect(
      controller.track({ kind: 'visit', path: '/oeuvre/kitsune' }, req()),
    ).resolves.toBeUndefined();

    expect(redis.rpush).toHaveBeenCalledTimes(1);
    const { key, event } = pushed(redis);
    expect(key).toBe('analytics:buffer');
    expect(event.kind).toBe('visit');
    expect(event.path).toBe('/oeuvre/kitsune');
    expect(event.visitorId).toEqual(expect.any(String));
  });

  it('D-5 · stamps `at` server-side and ignores any client-sent timestamp', async () => {
    const { controller, redis } = await build();

    await controller.track(
      { kind: 'visit', path: '/', at: '1999-01-01T00:00:00.000Z' } as never,
      req(),
    );

    const { event } = pushed(redis);
    expect(event.at).toEqual(expect.any(String));
    expect(event.at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('never stores the IP', async () => {
    const { controller, redis } = await build();

    await controller.track({ kind: 'visit', path: '/' }, req({ ip: '203.0.113.7' }));

    expect(JSON.stringify(pushed(redis).event)).not.toContain('203.0.113.7');
  });

  it('attributes the event to the signed-in account when there is one', async () => {
    const { controller, redis } = await build();

    await controller.track({ kind: 'visit', path: '/' }, req({ accountId: 'acc-1' }));

    expect(pushed(redis).event.accountId).toBe('acc-1');
  });

  it('leaves accountId null for a visitor', async () => {
    const { controller, redis } = await build();

    await controller.track({ kind: 'visit', path: '/' }, req());

    expect(pushed(redis).event.accountId).toBeNull();
  });

  describe('bot filtering (B7, D-4)', () => {
    it.each([
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
      'Twitterbot-preview/1.0',
      'Mozilla/5.0 (compatible; Yahoo! Slurp spider)',
      'Scrapy/2.11 web crawler',
    ])('drops %s without writing anything', async (ua) => {
      const { controller, redis } = await build();

      await expect(controller.track({ kind: 'visit', path: '/' }, req({ ua }))).resolves.toBeUndefined();

      expect(redis.rpush).not.toHaveBeenCalled();
    });

    it('drops a request with no user-agent at all (D-4)', async () => {
      const { controller, redis } = await build();

      await controller.track({ kind: 'visit', path: '/' }, req({ ua: undefined as never }));

      expect(redis.rpush).not.toHaveBeenCalled();
    });
  });

  describe('sanitising what is stored', () => {
    it('strips the query string from the path', async () => {
      const { controller, redis } = await build();

      await controller.track({ kind: 'visit', path: '/catalogue?genre=shonen&page=3' }, req());

      expect(pushed(redis).event.path).toBe('/catalogue');
    });

    it('strips the fragment too', async () => {
      const { controller, redis } = await build();

      await controller.track({ kind: 'visit', path: '/oeuvre/kitsune#chapitre-2' }, req());

      expect(pushed(redis).event.path).toBe('/oeuvre/kitsune');
    });

    it('reduces the referrer to its host', async () => {
      const { controller, redis } = await build();

      await controller.track(
        { kind: 'visit', path: '/', ref: 'https://www.google.com/search?q=manga+francais' },
        req(),
      );

      expect(pushed(redis).event.ref).toBe('www.google.com');
    });

    it('drops a malformed referrer instead of throwing', async () => {
      const { controller, redis } = await build();

      await expect(
        controller.track({ kind: 'visit', path: '/', ref: 'not a url' }, req()),
      ).resolves.toBeUndefined();

      expect(pushed(redis).event.ref).toBeNull();
    });
  });

  it('rejects a kind the browser may not emit — read/signup/publish are server-side only', async () => {
    // The real boundary: main.ts's global ValidationPipe({ whitelist: true }) against the DTO.
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false });
    const meta = { type: 'body' as const, metatype: TrackEventDto };

    await expect(pipe.transform({ kind: 'signup' }, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ kind: 'visit', path: '/' }, meta)).resolves.toEqual({
      kind: 'visit',
      path: '/',
    });
  });

  it('strips server-owned fields a client tries to send (whitelist)', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false });

    await expect(
      pipe.transform(
        { kind: 'visit', path: '/', visitorId: 'forged', accountId: 'forged', at: '1999-01-01' },
        { type: 'body', metatype: TrackEventDto },
      ),
    ).resolves.toEqual({ kind: 'visit', path: '/' });
  });

  it('fail-open · a Redis outage still returns 204, never a 500', async () => {
    const { controller } = await build(true);

    await expect(controller.track({ kind: 'visit', path: '/' }, req())).resolves.toBeUndefined();
  });

  it('records the event anonymously when no salt can be obtained', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    redis.setNx.mockResolvedValue(false); // lost the race AND the re-read came back empty
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [AnalyticsService, { provide: RedisService, useValue: redis }],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    await moduleRef.get(AnalyticsController).track({ kind: 'visit', path: '/' }, req());

    expect(pushed(redis).event.visitorId).toBeNull();
  });

  it('applies OptionalSessionGuard so a signed-in visit is attributed', () => {
    const guards = Reflect.getMetadata('__guards__', AnalyticsController.prototype.track) as unknown[];
    expect(guards).toContain(OptionalSessionGuard);
  });
});
