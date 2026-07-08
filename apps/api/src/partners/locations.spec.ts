import {
  expandLocationToken,
  formatLocationFr,
  countryLabelFr,
  PARTNER_LOCATION_TOKENS,
  COUNTRY_CONTINENTS,
} from '@encre-et-plume/shared';

describe('locations vocabulary', () => {
  it('maps France to Europe and Japan to Asia', () => {
    expect(COUNTRY_CONTINENTS['FR']).toBe('EU');
    expect(COUNTRY_CONTINENTS['JP']).toBe('AS');
    expect(COUNTRY_CONTINENTS['AR']).toBe('SA');
  });

  it('accepts continent names, ISO codes, and French régions as tokens', () => {
    expect(PARTNER_LOCATION_TOKENS).toContain('Europe'); // continent
    expect(PARTNER_LOCATION_TOKENS).toContain('JP'); // ISO code
    expect(PARTNER_LOCATION_TOKENS).toContain('Bretagne'); // French région
    expect(PARTNER_LOCATION_TOKENS).not.toContain('Hors France'); // retired
  });
});

describe('expandLocationToken', () => {
  it('expands a continent to all its country codes (Europe includes FR, excludes JP)', () => {
    const exp = expandLocationToken('Europe');
    expect(exp?.countries).toContain('FR');
    expect(exp?.countries).not.toContain('JP');
    expect(exp?.region).toBeUndefined();
  });

  it('expands an ISO country code to itself', () => {
    expect(expandLocationToken('JP')).toEqual({ countries: ['JP'] });
  });

  it('expands a French région to an exact region match', () => {
    expect(expandLocationToken('Bretagne')).toEqual({ region: 'Bretagne' });
  });

  it('returns null for an unknown token', () => {
    expect(expandLocationToken('Atlantide')).toBeNull();
  });
});

describe('formatLocationFr', () => {
  it('returns null when the country is absent', () => {
    expect(formatLocationFr(null, null)).toBeNull();
  });

  it('shows the French région for a French profile', () => {
    expect(formatLocationFr('FR', 'Bretagne')).toBe('Bretagne, France');
  });

  it('shows "France" for a French profile with no région', () => {
    expect(formatLocationFr('FR', null)).toBe('France');
  });

  it('shows the French country name for a non-French profile', () => {
    expect(formatLocationFr('JP', null)).toBe('Japon');
    expect(formatLocationFr('AR', null)).toBe('Argentine');
  });
});

describe('countryLabelFr', () => {
  it('returns the French display name of an ISO code', () => {
    expect(countryLabelFr('JP')).toBe('Japon');
  });
});
