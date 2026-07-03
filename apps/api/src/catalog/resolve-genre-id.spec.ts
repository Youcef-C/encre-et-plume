import { resolveGenreId } from '@encre-et-plume/shared';

describe('resolveGenreId (F-20 shared vocabulary)', () => {
  it('resolves a known fr label to its vocabulary id', () => {
    expect(resolveGenreId('Action')).toBe('action');
  });

  it('is case- and diacritics-insensitive (mirrors resolveGenre)', () => {
    expect(resolveGenreId('Shonen')).toBe('shonen');
    expect(resolveGenreId('shōnen')).toBe('shonen');
  });

  it('resolves via the en field too', () => {
    expect(resolveGenreId('Crime')).toBe('crime');
  });

  it('returns null for an unknown input', () => {
    expect(resolveGenreId('not-a-real-genre')).toBeNull();
  });
});
