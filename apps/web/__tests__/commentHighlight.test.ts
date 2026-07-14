import { describe, it, expect } from 'vitest';
import { commentRangesFrom } from '../components/editor/richtext/comment-highlight';

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
