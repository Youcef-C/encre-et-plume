import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  commentRangesFrom,
  commentColor,
  COMMENT_HIGHLIGHT_COLORS,
  quoteChanged,
  absPosToRelPos,
} from '../components/editor/richtext/comment-highlight';

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

// CS-15 — "· modifié" comparison: the stored quote (before) vs the live anchored text (after), tolerant
// of leading/trailing and internal whitespace so a reflow alone never flags a comment as modified.
describe('quoteChanged', () => {
  it('is false for identical text', () => {
    expect(quoteChanged('bonjour le monde', 'bonjour le monde')).toBe(false);
  });

  it('is false for whitespace-only differences (leading/trailing + internal runs)', () => {
    expect(quoteChanged('  bonjour le monde  ', 'bonjour le monde')).toBe(false);
    expect(quoteChanged('bonjour   le\tmonde', 'bonjour le monde')).toBe(false);
  });

  it('is true for a real text change', () => {
    expect(quoteChanged('bonjour le monde', 'bonsoir le monde')).toBe(true);
  });

  it('is true when the current text is empty but the quote is not (range fully deleted)', () => {
    expect(quoteChanged('bonjour', '')).toBe(true);
  });
});

// CS-15 — the vendored `absPosToRelPos` gives `from` right-association (assoc 0) and `to` left-association
// (assoc -1) so a Docs-like highlight extends on inside edits but not on edits at either outer boundary.
// Text-only fragment (single Y.XmlText) exercises the text branch directly — no PM mapping consulted.
describe('absPosToRelPos assoc bias', () => {
  const build = () => {
    const doc = new Y.Doc();
    const frag = doc.getXmlFragment('prosemirror');
    const t = new Y.XmlText();
    frag.insert(0, [t]);
    t.insert(0, 'bonjour le monde');
    return { doc, frag, t };
  };
  const abs = (doc: Y.Doc, rel: Y.RelativePosition) =>
    Y.createAbsolutePositionFromRelativePosition(rel, doc)?.index;

  it('keeps an insert at the FROM boundary outside the range (from shifts past it)', () => {
    const { doc, frag, t } = build();
    const relFrom = absPosToRelPos(4, frag, new Map(), 0);
    const relTo = absPosToRelPos(8, frag, new Map(), -1);
    t.insert(4, 'XX'); // typed immediately before the highlighted run
    expect(abs(doc, relFrom)).toBe(6); // from moved past the insert → the 2 chars are before the range
    expect(abs(doc, relTo)).toBe(10);
  });

  it('grows TO on an insert strictly inside the range, keeping FROM fixed', () => {
    const { doc, frag, t } = build();
    const relFrom = absPosToRelPos(4, frag, new Map(), 0);
    const relTo = absPosToRelPos(8, frag, new Map(), -1);
    t.insert(6, 'ZZ'); // typed inside 4..8
    expect(abs(doc, relFrom)).toBe(4);
    expect(abs(doc, relTo)).toBe(10); // range grew to cover the inserted text
  });

  it('keeps an insert at the TO boundary outside the range (to does not grow)', () => {
    const { doc, frag, t } = build();
    const relFrom = absPosToRelPos(4, frag, new Map(), 0);
    const relTo = absPosToRelPos(8, frag, new Map(), -1);
    t.insert(8, 'QQ'); // typed immediately after the highlighted run
    expect(abs(doc, relFrom)).toBe(4);
    expect(abs(doc, relTo)).toBe(8);
  });
});
