import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';

const NOW_S = 1_000_000; // fixed epoch seconds — avoids Date.now() drift
const NOW_MS = NOW_S * 1000;

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
  let redis: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      getOrThrow: jest.fn().mockResolvedValue(null), // no denylist, no epoch
    };
    // M3: SessionGuard reads via the strict variant — keep both mocked so either name works.
    redis.getOrThrow.mockImplementation((key: string) => redis.get(key));
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

  // ── ms-precision epoch: `ims` claim (issued-at in ms) vs `session-epoch-ms` key.
  //    Second-granularity iat left a 1s window where a pre-reset token survived
  //    a same-second reset (flaked in CI). ims closes it.

  it('allows request when token ims is after the ms epoch (same second, issued after reset)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S, ims: NOW_MS + 250, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('throws 401 when token ims < ms epoch even within the same second (pre-reset token)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S, ims: NOW_MS - 250, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS) : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 when token ims equals the ms epoch (boundary counts as pre-reset)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S, ims: NOW_MS, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS) : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('falls back to iat*1000 for legacy tokens without ims (issued before this deploy)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S - 100, exp: NOW_S + 3600 }); // no ims
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS) : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows a legacy token (no ims) whose iat*1000 is after the ms epoch', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S + 5, exp: NOW_S + 3600 }); // no ims
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('throws 401 when jti is in the denylist (existing logout behavior unchanged)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: NOW_S + 10, ims: (NOW_S + 10) * 1000, exp: NOW_S + 3600 });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `denylist:tok-1` ? '1' : null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not reject when both ims and iat are absent from payload (extra safety)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', exp: NOW_S + 3600 }); // no iat, no ims
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(key === `session-epoch-ms:acc-1` ? String(NOW_MS - 50) : null),
    );

    const result = await guard.canActivate(makeContext('valid-jwt'));
    expect(result).toBe(true);
  });

  it('L: pins JWT verification to HS256 (defense-in-depth against alg confusion)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'acc-1', iat: NOW_S, exp: NOW_S + 3600 });
    await guard.canActivate(makeContext('valid-jwt'));
    expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt', { algorithms: ['HS256'] });
  });
});

describe('SessionGuard — fail closed on Redis errors (M3)', () => {
  let guard: SessionGuard;
  let jwtService: { verify: jest.Mock };
  let redis: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(() => {
    jwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: NOW_S, exp: NOW_S + 3600 }),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      getOrThrow: jest.fn().mockResolvedValue(null),
    };
    guard = new SessionGuard(
      jwtService as unknown as JwtService,
      redis as unknown as RedisService,
    );
  });

  it('denies access when the denylist check errors (Redis outage)', async () => {
    redis.getOrThrow.mockImplementation((key: string) =>
      key.startsWith('denylist:') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toThrow();
  });

  it('denies access when the session-epoch check errors (Redis outage)', async () => {
    redis.getOrThrow.mockImplementation((key: string) =>
      key.startsWith('session-epoch-ms:') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(null),
    );

    await expect(guard.canActivate(makeContext('valid-jwt'))).rejects.toThrow();
  });
});
