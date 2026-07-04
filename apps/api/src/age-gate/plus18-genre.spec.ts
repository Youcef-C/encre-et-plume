import { hasPlus18Genre, PLUS18_GENRE_LABELS } from '@encre-et-plume/shared';

describe('hasPlus18Genre (DR-10 shared helper, D2)', () => {
  it('PLUS18_GENRE_LABELS holds exactly the explicitly-sexual entries', () => {
    expect([...PLUS18_GENRE_LABELS].sort()).toEqual(['Hentai', 'Smut', 'Érotique'].sort());
  });

  it('is true when any label is a plus18 entry (Hentai)', () => {
    expect(hasPlus18Genre(['Action', 'Hentai'])).toBe(true);
  });

  it('is true for Érotique', () => {
    expect(hasPlus18Genre(['Érotique'])).toBe(true);
  });

  it('is true for Smut', () => {
    expect(hasPlus18Genre(['Smut'])).toBe(true);
  });

  it('is false for mature-only labels (Gore, Guro, Yaoi are warning-only, not plus18)', () => {
    expect(hasPlus18Genre(['Gore', 'Guro', 'Yaoi'])).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(hasPlus18Genre([])).toBe(false);
  });
});
