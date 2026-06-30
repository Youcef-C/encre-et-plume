import { redact } from './redaction';

describe('redact()', () => {
  it('returns primitives unchanged', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
  });

  it('replaces denylisted keys with [REDACTED]', () => {
    const result = redact({ password: 'secret123', username: 'alice' }) as Record<string, unknown>;
    expect(result['password']).toBe('[REDACTED]');
    expect(result['username']).toBe('alice');
  });

  it('redacts token, accessToken, refreshToken', () => {
    const r = redact({ token: 'abc', accessToken: 'def', refreshToken: 'ghi' }) as Record<string, unknown>;
    expect(r['token']).toBe('[REDACTED]');
    expect(r['accessToken']).toBe('[REDACTED]');
    expect(r['refreshToken']).toBe('[REDACTED]');
  });

  it('redacts authorization and cookie headers (case-insensitive key match)', () => {
    const r = redact({ authorization: 'Bearer xyz', cookie: 'sid=abc', 'set-cookie': 'sid=abc' }) as Record<string, unknown>;
    expect(r['authorization']).toBe('[REDACTED]');
    expect(r['cookie']).toBe('[REDACTED]');
    expect(r['set-cookie']).toBe('[REDACTED]');
  });

  it('redacts email, secret, card, cvc, iban', () => {
    const r = redact({ email: 'a@b.com', secret: 'shhh', card: '4111', cvc: '123', iban: 'FR76' }) as Record<string, unknown>;
    expect(r['email']).toBe('[REDACTED]');
    expect(r['secret']).toBe('[REDACTED]');
    expect(r['card']).toBe('[REDACTED]');
    expect(r['cvc']).toBe('[REDACTED]');
    expect(r['iban']).toBe('[REDACTED]');
  });

  it('recurses into nested objects', () => {
    const r = redact({ user: { password: 'secret', name: 'bob' } }) as Record<string, unknown>;
    const user = r['user'] as Record<string, unknown>;
    expect(user['password']).toBe('[REDACTED]');
    expect(user['name']).toBe('bob');
  });

  it('recurses into arrays', () => {
    const r = redact([{ password: 'x' }, { safe: 'y' }]) as Array<Record<string, unknown>>;
    expect(r[0]['password']).toBe('[REDACTED]');
    expect(r[1]['safe']).toBe('y');
  });

  it('leaves safe keys intact', () => {
    const r = redact({ id: '123', displayName: 'Alice', status: 'ok' }) as Record<string, unknown>;
    expect(r['id']).toBe('123');
    expect(r['displayName']).toBe('Alice');
    expect(r['status']).toBe('ok');
  });

  it('redacts passwordHash', () => {
    const r = redact({ passwordHash: '$2b$10$abc' }) as Record<string, unknown>;
    expect(r['passwordHash']).toBe('[REDACTED]');
  });
});
