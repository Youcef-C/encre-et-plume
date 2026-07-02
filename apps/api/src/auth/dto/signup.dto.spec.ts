import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignupDto } from './signup.dto';

const BASE = {
  displayName: 'Yuki',
  email: 'yuki@test.com',
  password: 'password123',
  acceptCgu: true, // F-13: required
};

async function errorsFor(username?: unknown) {
  const dto = plainToInstance(SignupDto, username === undefined ? BASE : { ...BASE, username });
  return validate(dto);
}

describe('SignupDto — username format', () => {
  it('accepts a valid username (lowercase letters/digits/hyphens, 3–30 chars)', async () => {
    expect(await errorsFor('yuki-chan-42')).toHaveLength(0);
  });

  it('accepts an absent username (auto-generated slug path)', async () => {
    expect(await errorsFor()).toHaveLength(0);
  });

  it.each([
    ['uppercase', 'Yuki'],
    ['spaces', 'yuki chan'],
    ['accents', 'yüki'],
    ['too short', 'yu'],
    ['too long', 'a'.repeat(31)],
    ['underscore', 'yuki_chan'],
  ])('rejects %s with a French message', async (_label, bad) => {
    const errors = await errorsFor(bad);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('username');
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(/nom d'utilisateur/i);
  });
});

// ── F-13: acceptCgu validation ──────────────────────────────────────────────

describe('SignupDto — acceptCgu (F-13)', () => {
  it('accepts acceptCgu: true', async () => {
    const dto = plainToInstance(SignupDto, { ...BASE, acceptCgu: true });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects acceptCgu: false with French error message', async () => {
    const dto = plainToInstance(SignupDto, { ...BASE, acceptCgu: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('acceptCgu');
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(
      /vous devez accepter les conditions/i,
    );
  });

  it('rejects missing acceptCgu with French error message', async () => {
    const { acceptCgu: _ignored, ...withoutCgu } = BASE; // eslint-disable-line @typescript-eslint/no-unused-vars
    const dto = plainToInstance(SignupDto, withoutCgu);
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('acceptCgu');
  });
});
