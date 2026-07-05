// F-22: shared hashtag normalizer — single source of truth for the seed, the gallery `tag`
// filter, and the FE chip hrefs. Tested here because gallery is its primary consumer and the
// shared package has no jest runner of its own.
import { normalizeHashtag, normalizeHashtags, HASHTAG_MAX_LENGTH, HASHTAGS_MAX_COUNT } from '@encre-et-plume/shared';

describe('normalizeHashtag', () => {
  it('lowercases and strips a leading #', () => {
    expect(normalizeHashtag('#Naruto ')).toBe('naruto');
  });

  it('trims and collapses internal whitespace to a single space', () => {
    expect(normalizeHashtag('  Aquarelle   Sèche ')).toBe('aquarelle sèche');
  });

  it('keeps diacritics (does not fold accents)', () => {
    expect(normalizeHashtag('#Néon')).toBe('néon');
  });

  it('returns "" when nothing survives (bare #)', () => {
    expect(normalizeHashtag('#')).toBe('');
    expect(normalizeHashtag('   ')).toBe('');
  });

  it(`caps at ${HASHTAG_MAX_LENGTH} characters`, () => {
    expect(normalizeHashtag('a'.repeat(40))).toBe('a'.repeat(HASHTAG_MAX_LENGTH));
  });

  it('is a fixed point on an already-normalized token', () => {
    expect(normalizeHashtag('fanart')).toBe('fanart');
  });
});

describe('normalizeHashtags', () => {
  it('maps, drops empties, and dedupes preserving order', () => {
    expect(normalizeHashtags(['#Encre', 'encre', '  ', 'Néon'])).toEqual(['encre', 'néon']);
  });

  it(`caps the list at ${HASHTAGS_MAX_COUNT} entries`, () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(normalizeHashtags(many)).toHaveLength(HASHTAGS_MAX_COUNT);
  });

  it('leaves an already-conformant list byte-identical', () => {
    expect(normalizeHashtags(['yokai', 'feu', 'personnage'])).toEqual(['yokai', 'feu', 'personnage']);
  });
});
