import { hasPlus18Genre, PLUS18_GENRE_LABELS } from '@encre-et-plume/shared';

describe('hasPlus18Genre (DR-10 shared helper, D2)', () => {
  it('PLUS18_GENRE_LABELS holds exactly the 18+-flagged entries', () => {
    expect([...PLUS18_GENRE_LABELS].sort()).toEqual(
      ['Hentai', 'Smut', 'Érotique', 'Yaoi', 'Yuri', 'Ecchi'].sort(),
    );
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

  it('is true for the now-restricted Yaoi / Yuri / Ecchi', () => {
    expect(hasPlus18Genre(['Yaoi'])).toBe(true);
    expect(hasPlus18Genre(['Yuri'])).toBe(true);
    expect(hasPlus18Genre(['Ecchi'])).toBe(true);
  });

  it('is false for mature-only labels (Gore, Guro are warning-only, not plus18)', () => {
    expect(hasPlus18Genre(['Gore', 'Guro'])).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(hasPlus18Genre([])).toBe(false);
  });
});
