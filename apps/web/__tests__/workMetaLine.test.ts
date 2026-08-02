import { describe, it, expect } from 'vitest';
import { collectionMetaLine, workMetaLine, WORK_FORMAT_ILLUSTRATIONS } from '@encre-et-plume/shared';

describe('workMetaLine', () => {
  it('joins two creators with × and appends the chapter count', () => {
    expect(workMetaLine({ creatorNames: ['Camille Roux', 'Yuki Moreau'], chapterCount: 12 })).toBe(
      'Camille Roux × Yuki Moreau · 12 ch.',
    );
  });

  it('names a solo creator without a ×', () => {
    expect(workMetaLine({ creatorNames: ['Noé P.'], chapterCount: 1 })).toBe('Noé P. · 1 ch.');
  });

  it('names every creator of a team larger than two, in WorkCreator order', () => {
    expect(workMetaLine({ creatorNames: ['Camille Roux', 'Yuki Moreau', 'Noé P.'], chapterCount: 12 })).toBe(
      'Camille Roux × Yuki Moreau × Noé P. · 12 ch.',
    );
    expect(workMetaLine({ creatorNames: ['A', 'B', 'C', 'D'], chapterCount: 2 })).toBe('A × B × C × D · 2 ch.');
  });

  it('falls back to the chapter count alone when a work has no creator yet', () => {
    expect(workMetaLine({ creatorNames: [], chapterCount: 0 })).toBe('0 ch.');
  });

  it('ignores blank names rather than emitting a dangling ×', () => {
    expect(workMetaLine({ creatorNames: ['Léa B.', ''], chapterCount: 3 })).toBe('Léa B. · 3 ch.');
  });

  it('counts illustrations, not chapters, for a collection work', () => {
    expect(workMetaLine({ format: WORK_FORMAT_ILLUSTRATIONS, creatorNames: ['Léa B.'], chapterCount: 0, itemCount: 4 })).toBe(
      '4 illustrations · collection',
    );
  });

  it('is the same line collectionMetaLine draws for the cards and grids', () => {
    expect(workMetaLine({ format: WORK_FORMAT_ILLUSTRATIONS, creatorNames: [], chapterCount: 0, itemCount: 3 })).toBe(
      collectionMetaLine(3),
    );
  });

  it('singularises a one-piece collection', () => {
    expect(workMetaLine({ format: WORK_FORMAT_ILLUSTRATIONS, creatorNames: [], chapterCount: 0, itemCount: 1 })).toBe(
      '1 illustration · collection',
    );
  });
});
