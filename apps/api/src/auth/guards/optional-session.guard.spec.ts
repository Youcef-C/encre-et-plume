import { ExecutionContext } from '@nestjs/common';
import { OptionalSessionGuard } from './optional-session.guard';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';

function makeContext(cookieVal?: string): { context: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { cookies: cookieVal ? { ep_session: cookieVal } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

describe('OptionalSessionGuard (DR-10 BE-4)', () => {
  let guard: OptionalSessionGuard;
  let jwtService: { verify: jest.Mock };
  let redis: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null), getOrThrow: jest.fn().mockResolvedValue(null) };
    // M3: OptionalSessionGuard reads via the strict variant — proxy so existing `redis.get`
    // mocks in this file (and the M3 tests below) both drive the same behavior.
    redis.getOrThrow.mockImplementation((key: string) => redis.get(key));
    guard = new OptionalSessionGuard(
      jwtService as unknown as JwtService,
      redis as unknown as RedisService,
    );
  });

  it('allows the request and leaves accountId unset when no session cookie is present (visitor)', async () => {
    const { context, req } = makeContext();
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req['accountId']).toBeUndefined();
  });

  it('allows the request and leaves accountId unset when the JWT is invalid (never throws)', async () => {
    jwtService.verify.mockImplementation(() => { throw new Error('bad token'); });
    const { context, req } = makeContext('bad-jwt');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req['accountId']).toBeUndefined();
  });

  it('populates accountId when a valid session cookie is present', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: 1000, exp: 999999999 });
    const { context, req } = makeContext('good-jwt');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req['accountId']).toBe('acc-1');
  });

  it('leaves accountId unset when the jti is denylisted (logged-out session)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: 1000, exp: 999999999 });
    redis.get.mockImplementation((key: string) => Promise.resolve(key === 'denylist:tok-1' ? '1' : null));
    const { context, req } = makeContext('good-jwt');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req['accountId']).toBeUndefined();
  });

  it('L: pins JWT verification to HS256 (defense-in-depth against alg confusion)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: 1000, exp: 999999999 });
    const { context } = makeContext('good-jwt');
    await guard.canActivate(context);
    expect(jwtService.verify).toHaveBeenCalledWith('good-jwt', { algorithms: ['HS256'] });
  });

  describe('fail closed on Redis errors (M3)', () => {
    it('never authenticates (leaves accountId unset) when the denylist check errors', async () => {
      jwtService.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: 1000, exp: 999999999 });
      redis.get.mockImplementation((key: string) =>
        key.startsWith('denylist:') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(null),
      );
      const { context, req } = makeContext('good-jwt');

      const result = await guard.canActivate(context);

      expect(result).toBe(true); // never blocks a public read
      expect(req['accountId']).toBeUndefined(); // but must not trust an unverifiable token
    });

    it('never authenticates (leaves accountId unset) when the session-epoch check errors', async () => {
      jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: 1000, exp: 999999999 });
      redis.get.mockImplementation((key: string) =>
        key.startsWith('session-epoch-ms:') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(null),
      );
      const { context, req } = makeContext('good-jwt');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req['accountId']).toBeUndefined();
    });
  });
});
