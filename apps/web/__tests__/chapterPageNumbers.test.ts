import { describe, it, expect } from 'vitest';
import { chapterPageNumbers, type PageFileTag } from '@encre-et-plume/shared';

const simple = { fileTags: [] as PageFileTag[] };
const double = { fileTags: ['double'] as PageFileTag[] };

describe('chapterPageNumbers', () => {
  it('numbers simple cards 1..n', () => {
    expect(chapterPageNumbers([simple, simple, simple]).map((p) => p.label)).toEqual(['1', '2', '3']);
  });

  it('gives a double TWO slots, so the next card skips one', () => {
    expect(chapterPageNumbers([simple, double, simple, simple]).map((p) => p.label)).toEqual(['1', '2-3', '4', '5']);
  });

  it('handles a leading and a trailing double', () => {
    const got = chapterPageNumbers([double, simple, double]);
    expect(got.map((p) => p.label)).toEqual(['1-2', '3', '4-5']);
    expect(got[2].to).toBe(5); // the chapter is 5 pages long, not 3
  });

  it('exposes from/to so a single page is a one-page span', () => {
    expect(chapterPageNumbers([simple])[0]).toEqual({ from: 1, to: 1, label: '1' });
  });

  it('is empty for a chapter with no cards', () => {
    expect(chapterPageNumbers([])).toEqual([]);
  });

  it('ignores other file tags', () => {
    expect(chapterPageNumbers([{ fileTags: ['scenario', 'ref'] as PageFileTag[] }]).map((p) => p.label)).toEqual(['1']);
  });
});
