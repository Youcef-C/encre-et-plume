import { computeAge, deriveIsAdult, isPlausibleBirthdate } from '@encre-et-plume/shared';

const NOW = new Date('2026-07-04T12:00:00.000Z');

describe('computeAge (DR-10 shared helper)', () => {
  it('is exactly 18 on the 18th birthday itself', () => {
    expect(computeAge('2008-07-04', NOW)).toBe(18);
  });

  it('is still 17 the day before the 18th birthday', () => {
    expect(computeAge('2008-07-05', NOW)).toBe(17);
  });

  it('is 18 the day after the 18th birthday', () => {
    expect(computeAge('2008-07-03', NOW)).toBe(18);
  });

  it('handles a birthdate far in the past', () => {
    expect(computeAge('1990-01-01', NOW)).toBe(36);
  });
});

describe('deriveIsAdult (DR-10 shared helper)', () => {
  it('returns null when birthdate is null (no birthdate on file)', () => {
    expect(deriveIsAdult(null, NOW)).toBeNull();
  });

  it('returns true for an adult (age >= 18)', () => {
    expect(deriveIsAdult('2000-01-01', NOW)).toBe(true);
  });

  it('returns false for a minor (age < 18)', () => {
    expect(deriveIsAdult('2015-01-01', NOW)).toBe(false);
  });

  it('returns true exactly on the 18th birthday', () => {
    expect(deriveIsAdult('2008-07-04', NOW)).toBe(true);
  });
});

describe('isPlausibleBirthdate (DR-10 shared helper)', () => {
  it('accepts a plausible adult birthdate', () => {
    expect(isPlausibleBirthdate('1990-05-15', NOW)).toBe(true);
  });

  it('rejects a future date', () => {
    expect(isPlausibleBirthdate('2027-01-01', NOW)).toBe(false);
  });

  it('rejects a date more than 120 years ago', () => {
    expect(isPlausibleBirthdate('1900-01-01', NOW)).toBe(false);
  });

  it('accepts exactly 120 years ago', () => {
    expect(isPlausibleBirthdate('1906-07-04', NOW)).toBe(true);
  });

  it('rejects an unparsable date string', () => {
    expect(isPlausibleBirthdate('not-a-date', NOW)).toBe(false);
  });
});
