import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignupDto } from './signup.dto';

const BASE = {
  displayName: 'Yuki',
  email: 'yuki@test.com',
  password: 'password123',
  acceptCgu: true, // F-13: required
  birthdate: '1990-01-01', // DR-10: required
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

// ── DR-10: birthdate validation ──────────────────────────────────────────────

describe('SignupDto — birthdate (DR-10)', () => {
  async function errorsForBirthdate(birthdate: unknown) {
    const dto = plainToInstance(SignupDto, { ...BASE, birthdate });
    return validate(dto);
  }

  it('accepts a plausible adult birthdate', async () => {
    expect(await errorsForBirthdate('1990-01-01')).toHaveLength(0);
  });

  // Comportement CHANGÉ le 2026-08-02 : D4 (« pas d'âge minimum ») est remplacé par le seuil de 15 ans
  // des CGU art. 4. 2015-01-01 rend l'utilisateur trop jeune et n'est donc plus accepté.
  it('rejects a birthdate below the 15-year minimum, with its OWN message', async () => {
    const errors = await errorsForBirthdate('2015-01-01');
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('birthdate');
    const message = Object.values(errors[0].constraints ?? {}).join(' ');
    expect(message).toMatch(/au moins 15 ans/i);
    // La date est valide : elle ne doit PAS être qualifiée d'invalide.
    expect(message).not.toMatch(/date invalide/i);
  });

  it('accepts a minor who is at least 15', async () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    expect(await errorsForBirthdate(d.toISOString().slice(0, 10))).toHaveLength(0);
  });

  it('rejects a missing birthdate with "Date invalide"', async () => {
    const errors = await errorsForBirthdate(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('birthdate');
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(/date invalide/i);
  });

  it('rejects a malformed date string with "Date invalide"', async () => {
    const errors = await errorsForBirthdate('not-a-date');
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(/date invalide/i);
  });

  it('rejects a future date with "Date invalide"', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const errors = await errorsForBirthdate(future.toISOString().slice(0, 10));
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(/date invalide/i);
  });

  it('rejects a date more than 120 years ago with "Date invalide"', async () => {
    expect(await errorsForBirthdate('1900-01-01')).toHaveLength(1);
  });
});
