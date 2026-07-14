import { describe, it, expect } from 'vitest';
import { paginateBlocks, type BlockMetrics, type PageGeometry } from '../components/editor/richtext/pagination';

// Geometry with round numbers so the arithmetic is easy to eyeball.
//   pageH 1000, gap 20 → slot 1020 ; padY 50 → usable content 900, page-k content region
//   [k*1020+50 , k*1020+950].
const geo: PageGeometry = { pageH: 1000, gap: 20, padY: 50 };

describe('paginateBlocks', () => {
  it('leaves short content on a single page (no spacers)', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 100 },
      { pos: 5, top: 150, height: 100 },
    ];
    expect(paginateBlocks(blocks, geo)).toEqual({ spacers: [], pageCount: 1 });
  });

  it('pushes an overflowing block to the top of the next page with the right spacer height', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 800 }, // fits page 0 (bottom 850 ≤ 950)
      { pos: 11, top: 850, height: 200 }, // would end at 1050 > 950 → new page
    ];
    const res = paginateBlocks(blocks, geo);
    // page-1 content top = 1*1020 + 50 = 1070 ; block naturally at 850 → spacer 220
    expect(res.spacers).toEqual([{ pos: 11, height: 220 }]);
    expect(res.pageCount).toBe(2);
  });

  it('never pushes the first block even when it alone overflows a page (documented limit)', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 100 },
      { pos: 5, top: 150, height: 1000 }, // taller than one usable page (900) → cannot help by paging
    ];
    const res = paginateBlocks(blocks, geo);
    expect(res.spacers).toEqual([]);
    // content bottom 1150 spills past one slot (1020) → draw enough frames to cover it
    expect(res.pageCount).toBe(2);
  });

  it('accumulates multiple breaks across several pages', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 500 },
      { pos: 11, top: 550, height: 500 },
      { pos: 21, top: 1050, height: 500 },
      { pos: 31, top: 1550, height: 500 },
    ];
    const res = paginateBlocks(blocks, geo);
    expect(res.spacers).toEqual([
      { pos: 11, height: 520 },
      { pos: 21, height: 520 },
      { pos: 31, height: 520 },
    ]);
    expect(res.pageCount).toBe(4);
  });

  it('handles an empty block list', () => {
    expect(paginateBlocks([], geo)).toEqual({ spacers: [], pageCount: 1 });
  });

  // Bug: a trailing EMPTY block (the blank line the caret rests on) must never manufacture a page
  // break or an extra sheet — otherwise a doc that fits on one page draws a phantom empty page 2 whose
  // border reads as a "stray black line", and the caret sits on the pushed blank line in the gutter.
  it('ignores a trailing empty block so a blank line never forces a second page', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 850 }, // real content ends at 900 ≤ 950 → fits page 0
      { pos: 11, top: 900, height: 100, empty: true }, // blank caret line; would end 1000 > 950
    ];
    expect(paginateBlocks(blocks, geo)).toEqual({ spacers: [], pageCount: 1 });
  });

  it('a NON-empty block at the same spot still reflows (guards against over-trimming)', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 850 },
      { pos: 11, top: 900, height: 100 }, // real content overflow → still pushed
    ];
    const res = paginateBlocks(blocks, geo);
    expect(res.spacers).toEqual([{ pos: 11, height: 170 }]); // page-1 top 1070 − 900
    expect(res.pageCount).toBe(2);
  });

  it('trims a run of trailing empty blocks (not just one)', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 850 },
      { pos: 11, top: 900, height: 30, empty: true },
      { pos: 15, top: 930, height: 30, empty: true },
      { pos: 19, top: 960, height: 30, empty: true },
    ];
    expect(paginateBlocks(blocks, geo)).toEqual({ spacers: [], pageCount: 1 });
  });

  it('keeps an empty block that sits BETWEEN real content (only trailing ones are trimmed)', () => {
    const blocks: BlockMetrics[] = [
      { pos: 1, top: 50, height: 800 },
      { pos: 11, top: 850, height: 40, empty: true }, // blank line mid-doc — real height, keep it
      { pos: 15, top: 890, height: 200 }, // overflows (ends 1090 > 950) → pushed
    ];
    const res = paginateBlocks(blocks, geo);
    expect(res.spacers).toEqual([{ pos: 15, height: 180 }]); // page-1 top 1070 − 890
    expect(res.pageCount).toBe(2);
  });
});
