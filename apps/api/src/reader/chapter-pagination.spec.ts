import { chapterTotalPages } from './chapter-pagination';

describe('chapterTotalPages', () => {
  it('romans: ceils paragraphs / PROSE_PARAGRAPHS_PER_PAGE (10 paras -> 2 pages)', () => {
    const prose = Array.from({ length: 10 }, (_, i) => `Paragraphe ${i + 1}`).join('\n\n');
    expect(chapterTotalPages(true, prose, 0)).toBe(2);
  });

  it('romans: empty/null prose -> 0 pages', () => {
    expect(chapterTotalPages(true, null, 0)).toBe(0);
  });

  it('manga: passes pageCount through unchanged (6 -> 6)', () => {
    expect(chapterTotalPages(false, null, 6)).toBe(6);
  });
});
