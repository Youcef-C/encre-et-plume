import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  const ORIG_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it('throws in production when JWT_SECRET is unset', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['JWT_SECRET'];

    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be set to a strong value in production');
  });

  it('throws in production when JWT_SECRET is the dev default', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = 'dev-secret-change-in-prod';

    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be set to a strong value in production');
  });

  it('throws in production when JWT_SECRET is shorter than 32 chars', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = 'short-secret';

    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be set to a strong value in production');
  });

  it('returns the env value in production when it is strong', () => {
    process.env['NODE_ENV'] = 'production';
    const strong = 'a'.repeat(32);
    process.env['JWT_SECRET'] = strong;

    expect(getJwtSecret()).toBe(strong);
  });

  it('returns the env value outside production when set', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_SECRET'] = 'whatever-dev-value';

    expect(getJwtSecret()).toBe('whatever-dev-value');
  });

  it('falls back to the dev default outside production when unset', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['JWT_SECRET'];

    expect(getJwtSecret()).toBe('dev-secret-change-in-prod');
  });
});
