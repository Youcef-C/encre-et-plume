import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';

const NOW_S = 1_000_000; // fixed epoch seconds — avoids Date.now() drift

function makeContext(cookieVal?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        cookies: cookieVal ? { ep_session: cookieVal } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard — session epoch (BE-3)', () => {
  let guard: SessionGuard;
  let jwtService: { verify: jest.Mock };
  let redis: { get: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null) }; // no denylist, no epoch
    guard = new SessionGuard(
      jwtService as unknown as JwtService,
      redis as unknown as RedisService,
    );
  });

  it('throws 401 when no session cookie is present', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when JWT verification fails', async () => {
    jwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    await expect(guard.canActivate(makeContext('bad-jwt'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows request when no session-epoch key exists (backward compat — existing sessions unaffected)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S - 100, exp: NOW_S + 3600 });
    redis.get.mockResolvedValue(null); // no epoch, no denylist

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('allows request when token iat equals the epoch (edge: same second)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch:acc-1` ? String(NOW_S) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('allows request when token iat is after the epoch', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S + 5, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch:acc-1` ? String(NOW_S) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('throws 401 when token iat < epoch (password reset invalidated all sessions)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S - 100, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch:acc-1` ? String(NOW_S) : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 when jti is in the denylist (existing logout behavior unchanged)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: NOW_S + 10, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `denylist:tok-1` ? '1' : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not reject when iat is absent from payload (extra safety)', async () => {
    // JWT without iat claim — no epoch rejection should occur
    jwtService.verify.mockReturnValue({ sub: 'acc-1', exp: NOW_S + 3600 }); // no iat
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch:acc-1` ? String(NOW_S - 50) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });
});
