import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { ySyncPluginKey, relativePositionToAbsolutePosition } from '@tiptap/y-tiptap';
import { buildRichTextExtensions } from '../components/editor/richtext/core';
import { plancheExtensions, casePlaceholder } from '../components/editor/richtext/planche-schema';
import {
  commentRangesFrom,
  commentColor,
  COMMENT_HIGHLIGHT_COLORS,
  quoteChanged,
  absPosToRelPos,
  encodeCommentAnchor,
  resolveCommentTexts,
  resolveCommentRange,
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

  // CS-22 follow-up — the DURABLE anchor must not be gated by the drifted one. After a large deletion
  // the stored absolute pair clamps to a degenerate range and the row used to be dropped here, before
  // the relative pair was ever read: a comment whose anchored words still exist stopped painting.
  it('keeps a comment whose relative pair is present even when the absolute pair no longer fits', () => {
    const ranges = commentRangesFrom(
      [{ id: 'a', anchorFrom: 500, anchorTo: 510, anchorRelFrom: 'AQI=', anchorRelTo: 'AwQ=' }],
      20,
    );
    expect(ranges).toEqual([{ id: 'a', from: 20, to: 20, relFrom: 'AQI=', relTo: 'AwQ=' }]);
  });

  it('still drops a degenerate range when there is no relative pair to fall back on', () => {
    expect(commentRangesFrom([{ id: 'a', anchorFrom: 500, anchorTo: 510 }], 20)).toEqual([]);
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


// ── CS-22 — the anchor survives a RELOAD, not just the session ───────────────────────────────────
// CS-15 made the anchor durable in memory (Yjs relative positions) but persisted nothing, so on reload
// the highlight was rebuilt from the stored ABSOLUTE pair and had drifted by every edit made since.
// These tests round-trip the encoded pair through the DB shape (base64) into a FRESH Y.Doc + editor —
// which is exactly what a reload does — and check it resolves to the same words.
describe('CS-22 durable comment anchors', () => {
  const QUOTE = 'sanctuaire';
  const LINE = 'Rin entre dans le sanctuaire.';

  const makeEditor = (ydoc: Y.Doc): Editor =>
    new Editor({
      extensions: [
        ...buildRichTextExtensions({ collab: true, ownDocument: true, placeholder: casePlaceholder }),
        ...plancheExtensions,
        Collaboration.configure({ document: ydoc }),
      ],
    });

  const seed = (editor: Editor) =>
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'caseBlock',
            attrs: { no: 1 },
            content: [
              { type: 'caseDescription', content: [{ type: 'paragraph', content: [{ type: 'text', text: LINE }] }] },
              { type: 'caseDialogue', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'RIN — « Enfin. »' }] }] },
            ],
          },
        ],
      },
      { emitUpdate: false },
    );

  /** absolute range of `needle` in the current doc */
  const rangeOf = (editor: Editor, needle: string) => {
    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from < 0 && node.isText && node.text?.includes(needle)) from = pos + node.text.indexOf(needle);
    });
    return { from, to: from + needle.length };
  };

  const highlightText = (editor: Editor) =>
    Array.from(editor.view.dom.querySelectorAll('.ep-comment-highlight'))
      .map((el) => el.textContent)
      .join('');

  /** A reload: fresh Y.Doc hydrated from the persisted state, fresh editor, no plugin memory. */
  const reload = (ydoc: Y.Doc) => {
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, Y.encodeStateAsUpdate(ydoc));
    return makeEditor(fresh);
  };

  // The DB→client boundary: base64 back to a Yjs RelativePosition, then to the live absolute range.
  const decode = (b64: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Y.decodeRelativePosition(bytes);
  };
  const textOfStoredAnchor = (editor: Editor, rel: { relFrom: string; relTo: string }) => {
    const y = ySyncPluginKey.getState(editor.state) as any;
    const from = relativePositionToAbsolutePosition(y.doc, y.type, decode(rel.relFrom), y.binding.mapping);
    const to = relativePositionToAbsolutePosition(y.doc, y.type, decode(rel.relTo), y.binding.mapping);
    if (from == null || to == null || to <= from) return '';
    return editor.state.doc.textBetween(from, to, ' ');
  };

  it('encodes the selection to base64 relative positions (both ends, inside the API cap)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const { from, to } = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, from, to);
    expect(rel).not.toBeNull();
    expect(rel!.relFrom).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(rel!.relTo).not.toBe(rel!.relFrom);
    expect(Math.max(rel!.relFrom.length, rel!.relTo.length)).toBeLessThan(688); // API cap: 512 bytes
    editor.destroy();
  });

  it('returns null when there is no Yjs binding yet (nothing durable to encode)', () => {
    const editor = new Editor({
      extensions: [...buildRichTextExtensions({ collab: false, ownDocument: true, placeholder: casePlaceholder }), ...plancheExtensions],
    });
    expect(encodeCommentAnchor(editor.state, 1, 3)).toBeNull();
    editor.destroy();
  });

  it('AC1 — a peer inserts text ABOVE; after a reload the stored anchor still resolves to the quoted words', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE); // what the DB stores as anchorFrom/anchorTo
    const rel = encodeCommentAnchor(editor.state, stale.from, stale.to)!;
    editor.view.dispatch(editor.state.tr.insertText('Un plan large de la ville. ', stale.from - LINE.indexOf(QUOTE)));
    editor.destroy();

    const b = reload(ydoc);
    expect(textOfStoredAnchor(b, rel)).toBe(QUOTE);
    // …and the stored ABSOLUTE pair — the only thing CS-4 persisted — has drifted (the bug CS-22 fixes).
    expect(b.state.doc.textBetween(stale.from, stale.to, ' ')).not.toBe(QUOTE);
    b.destroy();
  });

  it('AC1 — and the reloaded editor PAINTS the highlight on those words', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, stale.from, stale.to)!;
    editor.view.dispatch(editor.state.tr.insertText('Un plan large de la ville. ', stale.from - LINE.indexOf(QUOTE)));
    editor.destroy();

    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'c1', ...stale, relFrom: rel.relFrom, relTo: rel.relTo }]);
    expect(highlightText(b)).toBe(QUOTE);
    b.destroy();
  });

  // CS-22 follow-up — « voir dans le texte » used to jump to the STORED absolute pair, so on a drifted
  // row it selected the wrong words even while the highlight (resolved from the durable anchor) sat
  // correctly a few characters away. The jump must resolve through the same anchor the paint uses.
  it('resolveCommentRange returns the DURABLE range after a drift, not the stored absolute one', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, stale.from, stale.to)!;
    editor.view.dispatch(editor.state.tr.insertText('Un plan large de la ville. ', stale.from - LINE.indexOf(QUOTE)));
    editor.destroy();

    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'c1', ...stale, relFrom: rel.relFrom, relTo: rel.relTo }]);
    const live = resolveCommentRange(b.state, 'c1');
    expect(live).not.toBeNull();
    expect(b.state.doc.textBetween(live!.from, live!.to, ' ')).toBe(QUOTE);
    expect(live!.from).not.toBe(stale.from); // it really did drift; the stored pair would miss
    b.destroy();
  });

  it('resolveCommentRange is null for an unknown id (caller keeps the stored pair)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    expect(resolveCommentRange(editor.state, 'nope')).toBeNull();
    editor.destroy();
  });

  // CS-15 defect (misfiled in CS-22 frontend-notes §8.1 as a whole-line/`assoc` problem; it is neither).
  // `buildDecos` runs inside the plugin's `apply` and resolves through `binding.mapping`, which has NOT
  // been updated for the transaction that just changed the doc — so positions computed against the
  // pre-edit mapping are applied to the post-edit doc and every highlight shifts by the edit's length.
  // It is not whole-line specific (a mid-line anchor drifts identically) and it is not the structural
  // fallback (it happens WITH the CS-22 relative pair, which never reaches those branches).
  it('paints the right words in the SAME transaction as an edit above (no one-transaction lag)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const { from, to } = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, from, to)!;
    editor.commands.setCommentHighlights([{ id: 'c1', from, to, relFrom: rel.relFrom, relTo: rel.relTo }]);
    expect(highlightText(editor)).toBe(QUOTE);

    // An edit ABOVE the anchor, and NO re-paint afterwards: the highlight must already be right.
    editor.view.dispatch(editor.state.tr.insertText('AVANT. ', from - LINE.indexOf(QUOTE)));
    expect(highlightText(editor)).toBe(QUOTE);
    editor.destroy();
  });

  it('AC1 (control) — the same reload WITHOUT the relative pair paints the drifted words', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    editor.view.dispatch(editor.state.tr.insertText('Un plan large de la ville. ', stale.from - LINE.indexOf(QUOTE)));
    editor.destroy();

    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'c1', ...stale }]);
    expect(highlightText(b)).not.toBe(QUOTE);
    b.destroy();
  });

  it('AC2 — across a reload, an insert immediately BEFORE stays outside and an insert INSIDE grows it', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, stale.from, stale.to)!;
    editor.destroy();

    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'c1', ...stale, relFrom: rel.relFrom, relTo: rel.relTo }]);
    b.view.dispatch(b.state.tr.insertText('XX', rangeOf(b, QUOTE).from)); // immediately before
    expect(textOfStoredAnchor(b, rel)).toBe(QUOTE); // not swallowed
    b.view.dispatch(b.state.tr.insertText('ZZ', rangeOf(b, 'sanctu').from + 3)); // strictly inside
    expect(textOfStoredAnchor(b, rel)).toBe('sanZZctuaire'); // grew
    // …and that is what gets painted. The repaint trails the edit by ONE doc transaction (pre-existing
    // CS-15 behaviour, unchanged by CS-22: the plugin resolves relative→absolute while ySync has not yet
    // pushed the local step into the Y.Doc, so the next keystroke is what shows it).
    b.view.dispatch(b.state.tr.insertText('.', b.state.doc.content.size - 4));
    expect(highlightText(b)).toBe('sanZZctuaire');
    b.destroy();
  });

  it('AC3 — a pre-CS-22 comment (no relative pair) still paints via the absolute fallback', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    editor.destroy();
    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'legacy', ...stale, relFrom: null, relTo: null }]);
    expect(highlightText(b)).toBe(QUOTE);
    b.destroy();
  });

  it('D-3 — a malformed stored anchor falls back to the absolute pair instead of throwing', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    editor.destroy();
    const b = reload(ydoc);
    expect(() =>
      b.commands.setCommentHighlights([{ id: 'broken', ...stale, relFrom: 'pas du base64 !!', relTo: '####' }]),
    ).not.toThrow();
    expect(highlightText(b)).toBe(QUOTE);
    b.destroy();
  });

  it('AC4 — deleting all the anchored text collapses the anchor (the sidebar keeps the comment + quote)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    seed(editor);
    const stale = rangeOf(editor, QUOTE);
    const rel = encodeCommentAnchor(editor.state, stale.from, stale.to)!;
    editor.destroy();

    const b = reload(ydoc);
    b.commands.setCommentHighlights([{ id: 'c1', ...stale, relFrom: rel.relFrom, relTo: rel.relTo }]);
    const live = rangeOf(b, QUOTE);
    b.view.dispatch(b.state.tr.delete(live.from, live.to));
    expect(textOfStoredAnchor(b, rel)).toBe(''); // collapsed, not fallen back to a wrong range
    expect(resolveCommentTexts(b.state).get('c1')).toBe('');
    expect(quoteChanged(QUOTE, resolveCommentTexts(b.state).get('c1')!)).toBe(true); // « · modifié »
    b.destroy();
  });

  it('commentRangesFrom carries the stored relative pair through to the range', () => {
    const [r] = commentRangesFrom([{ id: 'a', anchorFrom: 4, anchorTo: 10, anchorRelFrom: 'AQID', anchorRelTo: 'BAUG' }], 100);
    expect(r).toEqual({ id: 'a', from: 4, to: 10, relFrom: 'AQID', relTo: 'BAUG' });
    const [legacy] = commentRangesFrom([{ id: 'b', anchorFrom: 4, anchorTo: 10 }], 100);
    expect(legacy).toEqual({ id: 'b', from: 4, to: 10 });
  });
});
