import { verifySessionToken } from './session-token';
import type { JwtService } from '@nestjs/jwt';
import type { RedisService } from '../redis/redis.service';

function build() {
  const jwt = { verify: jest.fn() };
  const redis = { getOrThrow: jest.fn().mockResolvedValue(null) };
  const run = (token: string) =>
    verifySessionToken(jwt as unknown as JwtService, redis as unknown as RedisService, token);
  return { jwt, redis, run };
}

describe('verifySessionToken (shared by SessionGuard + MC-9 WS gateway)', () => {
  it('returns the identity for a valid token (HS256-pinned verify)', async () => {
    const { jwt, run } = build();
    jwt.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', exp: 999999999, iat: 1000 });
    await expect(run('good')).resolves.toEqual({ accountId: 'acc-1', jti: 'tok-1', tokenExp: 999999999 });
    expect(jwt.verify).toHaveBeenCalledWith('good', { algorithms: ['HS256'] });
  });

  it('returns null when the JWT is invalid/expired', async () => {
    const { jwt, run } = build();
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });
    await expect(run('bad')).resolves.toBeNull();
  });

  it('returns null when the jti is denylisted (logged-out session)', async () => {
    const { jwt, redis, run } = build();
    jwt.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: 1000, exp: 999999999 });
    redis.getOrThrow.mockImplementation((key: string) =>
      Promise.resolve(key === 'denylist:tok-1' ? '1' : null),
    );
    await expect(run('good')).resolves.toBeNull();
  });

  it('returns null when the token was issued before the session epoch (pre-reset)', async () => {
    const { jwt, redis, run } = build();
    jwt.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', ims: 1000, iat: 1 });
    redis.getOrThrow.mockImplementation((key: string) =>
      Promise.resolve(key === 'session-epoch-ms:acc-1' ? '2000' : null),
    );
    await expect(run('good')).resolves.toBeNull();
  });

  it('accepts a token issued after the session epoch', async () => {
    const { jwt, redis, run } = build();
    jwt.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', ims: 3000, iat: 3 });
    redis.getOrThrow.mockImplementation((key: string) =>
      Promise.resolve(key === 'session-epoch-ms:acc-1' ? '2000' : null),
    );
    await expect(run('good')).resolves.toMatchObject({ accountId: 'acc-1' });
  });

  it('propagates a Redis outage (fail closed — never returns an authenticated identity)', async () => {
    const { jwt, redis, run } = build();
    jwt.verify.mockReturnValue({ sub: 'acc-1', jti: 'tok-1', iat: 1000, exp: 999999999 });
    redis.getOrThrow.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(run('good')).rejects.toThrow('ECONNREFUSED');
  });
});
