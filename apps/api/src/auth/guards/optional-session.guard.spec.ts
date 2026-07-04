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
  let redis: { get: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null) };
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
});
