import { describe, it, expect } from 'vitest';
import { effectiveCoverPageId, readerPagesShown } from '@encre-et-plume/shared';

// CS-6 — the ONE cover rule (user, 2026-08-01): whatever OPENS the chapter is its cover, when the
// chapter has one at all. Positional, so reordering IS re-designating; `hasCover` is the only stored
// part. A hand-picked cover IMAGE belongs to the project, never to a chapter.
describe('effectiveCoverPageId', () => {
  it('is the page in the first slot', () => {
    expect(effectiveCoverPageId({ hasCover: true, pages: [{ id: 'p1' }, { id: 'p2' }] })).toBe('p1');
  });

  it('follows the first slot when the order changes — no separate designation to update', () => {
    expect(effectiveCoverPageId({ hasCover: true, pages: [{ id: 'p3' }, { id: 'p1' }] })).toBe('p3');
  });

  it('is null when the chapter does not open on a cover', () => {
    expect(effectiveCoverPageId({ hasCover: false, pages: [{ id: 'p1' }, { id: 'p2' }] })).toBeNull();
  });

  it('is null for a chapter with no pages', () => {
    expect(effectiveCoverPageId({ hasCover: true, pages: [] })).toBeNull();
  });
});

// The rule the reader stage DRAWS with and the pager STEPS by — one function, because disagreement
// means a page is drawn alone and then skipped over.
describe('readerPagesShown', () => {
  it('shows one page in single mode', () => {
    expect(readerPagesShown(1, 10, 'single')).toBe(1);
  });

  it('pairs two in spread mode', () => {
    expect(readerPagesShown(2, 10, 'double')).toBe(2);
  });

  it('never pairs a cover — it is a standalone recto', () => {
    expect(readerPagesShown(1, 10, 'double', { hasCover: true })).toBe(1);
    expect(readerPagesShown(1, 10, 'double', { hasCover: false })).toBe(2);
  });

  it('shows a « double » panel alone: it already spans both pages', () => {
    expect(readerPagesShown(4, 10, 'double', { currentIsDouble: true })).toBe(1);
  });

  it('refuses to pair a page with a « double » — half a spread beside another page is not a reading', () => {
    expect(readerPagesShown(4, 10, 'double', { nextIsDouble: true })).toBe(1);
  });

  it('shows the last page alone — it has no partner', () => {
    expect(readerPagesShown(10, 10, 'double')).toBe(1);
  });
});
