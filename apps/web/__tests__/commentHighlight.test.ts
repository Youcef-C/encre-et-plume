import { describe, it, expect } from 'vitest';
import { commentRangesFrom, commentColor, COMMENT_HIGHLIGHT_COLORS } from '../components/editor/richtext/comment-highlight';

// Item 5 — only comments carrying a valid in-bounds range paint an inline highlight; case-level
// comments (null anchors) and out-of-order / out-of-bounds ranges are dropped.
describe('commentRangesFrom', () => {
  it('keeps comments with a valid range', () => {
    const ranges = commentRangesFrom([{ id: 'a', anchorFrom: 4, anchorTo: 10 }], 100);
    expect(ranges).toEqual([{ id: 'a', from: 4, to: 10 }]);
  });

  it('drops case-level comments (null anchors)', () => {
    const ranges = commentRangesFrom([{ id: 'a', anchorFrom: null, anchorTo: null }], 100);
    expect(ranges).toEqual([]);
  });

  it('drops empty / reversed ranges', () => {
    const ranges = commentRangesFrom(
      [
        { id: 'a', anchorFrom: 10, anchorTo: 10 },
        { id: 'b', anchorFrom: 20, anchorTo: 5 },
      ],
      100,
    );
    expect(ranges).toEqual([]);
  });

  it('clamps a range that overruns the current doc size (stale positions)', () => {
    const ranges = commentRangesFrom([{ id: 'a', anchorFrom: 4, anchorTo: 999 }], 20);
    expect(ranges).toEqual([{ id: 'a', from: 4, to: 20 }]);
  });
});

// Item 5 (batch) — each comment gets its OWN highlight colour, assigned by message order so adjacent
// comments never collide and the sequence reads as intentional (the sidebar quote shares the colour).
describe('commentColor', () => {
  it('returns a palette entry for any order index', () => {
    for (let i = 0; i < 50; i++) expect(COMMENT_HIGHLIGHT_COLORS).toContain(commentColor(i));
  });

  it('offers at least 16 distinct colours (not just shades)', () => {
    expect(new Set(COMMENT_HIGHLIGHT_COLORS).size).toBeGreaterThanOrEqual(16);
  });

  it('gives consecutive comments distinct colours', () => {
    for (let i = 0; i < COMMENT_HIGHLIGHT_COLORS.length - 1; i++) {
      expect(commentColor(i)).not.toBe(commentColor(i + 1));
    }
  });

  it('cycles the palette deterministically by order', () => {
    expect(commentColor(0)).toBe(commentColor(COMMENT_HIGHLIGHT_COLORS.length));
    expect(commentColor(3)).toBe(commentColor(3));
  });
});
