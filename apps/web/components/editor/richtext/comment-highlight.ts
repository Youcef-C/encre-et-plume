// CS-4 item 5 — inline highlight decorations for range-anchored comments. Comments that carry a
// ProseMirror range (anchorFrom/anchorTo) paint an `.ep-comment-highlight` inline mark so the reader
// sees which text a comment refers to. Decoration only — never serialized into the doc/Yjs. Positions
// are best-effort (they can drift after collaborative edits); the comment's stored `quote` is the
// durable indicator, so a stale range simply stops painting rather than mis-highlighting.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import * as Y from 'yjs';
// TipTap v3's Collaboration extension binds via @tiptap/y-tiptap (its y-prosemirror fork), so the
// live ySyncPlugin state — and thus the RelativePosition helpers — MUST come from y-tiptap: the
// PluginKey from the upstream `y-prosemirror` is a different instance and getState() would no-op.
import { ySyncPluginKey, relativePositionToAbsolutePosition } from '@tiptap/y-tiptap';

export interface CommentRange {
  id: string;
  from: number;
  to: number;
  /** Highlight colour, assigned by message order (commentColor). Falls back to the first hue. */
  color?: string;
  /** CS-5 r4 (FR14) — this comment IS a scenario correction request → tag its highlight distinctly
   *  (`ep-correction-highlight`, colour-plus-shape, not colour-only). */
  correction?: boolean;
  /** CS-22 — the PERSISTED Yjs relative positions (base64, as stored on the comment row). Preferred
   *  over `from`/`to`, which have drifted by every edit made since the comment was filed. */
  relFrom?: string | null;
  relTo?: string | null;
}

// Item 5 (batch) — one distinct highlight colour per comment, assigned by MESSAGE ORDER (not a hash of
// the id, which looked random and collided). 16 well-separated hues spanning the wheel — distinct
// colours, not shades — so adjacent/overlapping comments never share a colour and the sidebar quote
// accent matches its in-canvas highlight.
export const COMMENT_HIGHLIGHT_COLORS = [
  '#e8261c', // red (accent)
  '#e8631c', // orange
  '#e89a1c', // amber
  '#c9a21a', // gold
  '#7fa11e', // olive
  '#2e9e5b', // green
  '#1ba098', // teal
  '#1c86e8', // sky blue
  '#2f5fd0', // indigo
  '#5b3fd0', // violet
  '#8f3fd0', // purple
  '#c2367f', // magenta
  '#d02f5b', // rose
  '#8a5a2b', // brown
  '#4a7a8c', // slate
  '#6b7f2e', // moss
] as const;

/** Colour for the comment at 0-based message order `n` — cycles the 16-hue palette. */
export function commentColor(n: number): string {
  const len = COMMENT_HIGHLIGHT_COLORS.length;
  return COMMENT_HIGHLIGHT_COLORS[((Math.trunc(n) % len) + len) % len];
}

/** Pure: keep only comments with a valid in-bounds range, clamped to the current doc size. Exported
 *  for testing (the plugin re-uses the same filter before building decorations). */
export function commentRangesFrom(
  comments: {
    id: string;
    anchorFrom: number | null;
    anchorTo: number | null;
    // CS-22 — carried through untouched; the plugin prefers them over the (drifted) absolute pair.
    anchorRelFrom?: string | null;
    anchorRelTo?: string | null;
  }[],
  docSize: number,
): CommentRange[] {
  const out: CommentRange[] = [];
  for (const c of comments) {
    if (c.anchorFrom == null || c.anchorTo == null) continue;
    const from = Math.max(0, Math.min(c.anchorFrom, docSize));
    const to = Math.max(0, Math.min(c.anchorTo, docSize));
    const rel = c.anchorRelFrom && c.anchorRelTo ? { relFrom: c.anchorRelFrom, relTo: c.anchorRelTo } : null;
    // CS-22 follow-up — a row carrying a DURABLE pair is admitted whatever the absolute pair says. The
    // absolute numbers drift by every edit since the comment was filed, so after a large deletion they
    // clamp to a degenerate range; dropping the row here discarded a relative anchor that still resolves
    // to live words. The plugin prefers `rel` anyway, and `buildAbsolute`'s pre-binding paint still
    // skips a degenerate range on its own.
    if (to > from || rel) out.push({ id: c.id, from, to, ...(rel ?? {}) });
  }
  return out;
}

export const commentHighlightKey = new PluginKey<HighlightState>('commentHighlight');

// A comment anchored to Yjs RELATIVE positions. Absolute ProseMirror positions drift under
// collaborative editing: DecorationSet.map (inward bias) DROPS a highlight when a remote peer's edit
// replaces the underlying text node (y-prosemirror rebuilds nodes on remote sync), and outward-bias
// mapping GROWS it to swallow the doc. Yjs relative positions bind to a CRDT item, so they resolve to
// the correct absolute range across local AND remote edits without growing or dropping — the standard
// collaborative-anchor approach. We convert each comment's absolute range to relative ONCE (keyed by
// id, so re-painting the whole list when a new comment arrives never disturbs existing anchors), then
// resolve relative→absolute every transaction to rebuild the decorations.
interface Anchor {
  id: string;
  color: string;
  correction: boolean;
  from: Y.RelativePosition;
  to: Y.RelativePosition;
}
interface HighlightState {
  anchors: Anchor[];
  pending: CommentRange[] | null; // desired ranges awaiting a ready y-sync binding
  set: DecorationSet;
}

interface YSyncState {
  type: Y.XmlFragment;
  doc: Y.Doc;
  binding: { mapping: Map<Y.AbstractType<unknown>, PMNode> } | null;
}

function ySync(state: EditorState): YSyncState | null {
  const s = ySyncPluginKey.getState(state) as YSyncState | undefined;
  return s && s.binding ? s : null;
}

// CS-15 — vendored + adapted from @tiptap/y-tiptap@3.0.6 `absolutePositionToRelativePosition`
// (dist/y-tiptap.cjs L1635-1701) and its `createRelativePosition` helper (L1723). The upstream helper
// hard-codes assoc = -1 (LEFT association) for every text position, so BOTH ends of a comment range
// left-associate and an insert immediately BEFORE a highlight lands INSIDE it. We expose the `assoc`
// parameter so the plugin can bind `from` right-associated (assoc 0 → an insert at the start boundary
// stays outside) and `to` left-associated (assoc -1 → an insert at the end boundary stays outside; an
// insert strictly inside shifts `to` right, growing the highlight) — the Docs-like contract (FE-1).
// Only the three `createRelativePositionFromTypeIndex(…, -1)` call sites take `assoc`; the structural
// boundary fallbacks are unchanged from upstream (their association is inherent). Decoration-only:
// nothing here is serialized — the DB `anchorFrom`/`anchorTo` are untouched.
function createRelativePosition(type: any, item: any): Y.RelativePosition {
  let typeid = null;
  let tname = null;
  if (type._item === null) {
    tname = Y.findRootTypeKey(type);
  } else {
    typeid = Y.createID(type._item.id.client, type._item.id.clock);
  }
  return new Y.RelativePosition(typeid, tname, item.id);
}

export function absPosToRelPos(
  pos: number,
  type: Y.XmlFragment,
  mapping: Map<Y.AbstractType<unknown>, PMNode>,
  assoc: -1 | 0,
): Y.RelativePosition {
  const t = type as any;
  // Plain boolean (not a type predicate) so `n` keeps its `any` type through the Yjs-internal traversal.
  const isXmlText = (x: any): boolean => x.constructor === Y.XmlText;
  if (pos === 0) {
    return Y.createRelativePositionFromTypeIndex(type, 0, assoc);
  }
  let n: any = t._first === null ? null : t._first.content.type;
  while (n !== null && type !== n) {
    if (isXmlText(n)) {
      if (n._length >= pos) {
        return Y.createRelativePositionFromTypeIndex(n, pos, assoc);
      } else {
        pos -= n._length;
      }
      if (n._item !== null && n._item.next !== null) {
        n = n._item.next.content.type;
      } else {
        do {
          n = n._item === null ? null : n._item.parent;
          pos--;
        } while (n !== type && n !== null && n._item !== null && n._item.next === null);
        if (n !== null && n !== type) {
          n = n._item === null ? null : n._item.next.content.type;
        }
      }
    } else {
      const pNodeSize = (mapping.get(n) || { nodeSize: 0 }).nodeSize;
      if (n._first !== null && pos < pNodeSize) {
        n = n._first.content.type;
        pos--;
      } else {
        if (pos === 1 && n._length === 0 && pNodeSize > 1) {
          return new Y.RelativePosition(
            n._item === null ? null : n._item.id,
            n._item === null ? Y.findRootTypeKey(n) : null,
            null,
          );
        }
        pos -= pNodeSize;
        if (n._item !== null && n._item.next !== null) {
          n = n._item.next.content.type;
        } else {
          if (pos === 0) {
            n = n._item === null ? n : n._item.parent;
            return new Y.RelativePosition(
              n._item === null ? null : n._item.id,
              n._item === null ? Y.findRootTypeKey(n) : null,
              null,
            );
          }
          do {
            n = n._item.parent;
            pos--;
          } while (n !== type && n._item.next === null);
          if (n !== type) {
            n = n._item.next.content.type;
          }
        }
      }
    }
    if (n === null) {
      throw new Error('absPosToRelPos: unexpected case');
    }
    if (pos === 0 && n.constructor !== Y.XmlText && n !== type) {
      return createRelativePosition(n._item.parent, n._item);
    }
  }
  return Y.createRelativePositionFromTypeIndex(type, t._length, assoc);
}

// ── CS-22 — persisting the anchor ────────────────────────────────────────────────────────────────
// CS-15 built the whole relative-position layer but serialized none of it, so an anchor survived the
// session and died on reload. These three functions are the only new machinery: encode the SAME
// relative positions the decorations already use (identical `assoc` biases — the persisted anchor must
// not disagree with the live one), ship them as base64, and decode them back on load. `btoa`/`atob`
// (not Buffer) — this runs in the browser.
const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** Decode a stored anchor. Returns null for an absent (pre-CS-22 row) or structurally unusable payload
 *  — the caller then falls back to the absolute pair, exactly as before CS-22. A position that decodes
 *  fine but resolves to nothing is a DIFFERENT case (the text was deleted): that one must collapse the
 *  highlight, not fall back, so it is deliberately not handled here. */
function decodeRelPos(b64: string | null | undefined): Y.RelativePosition | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Y.decodeRelativePosition(bytes);
  } catch {
    return null;
  }
}

/** CS-22 follow-up — the absolute fallback, made total. Now that a row can be admitted on its relative
 *  pair alone, `from`/`to` may be out of bounds when the fallback runs, and `absPosToRelPos` throws on a
 *  document shape it cannot walk. A null here just means "this comment gets no highlight this pass". */
function tryAbsPosToRelPos(pos: number, y: YSyncState, assoc: -1 | 0): Y.RelativePosition | null {
  try {
    return absPosToRelPos(pos, y.type, y.binding!.mapping, assoc);
  } catch {
    return null;
  }
}

/**
 * CS-22 — encode a live selection into the durable pair sent to the API on create.
 * `from` right-associated (assoc 0), `to` left-associated (assoc -1) — the same biases the plugin binds
 * with, so the persisted anchor and the in-session one behave identically.
 * Returns null when the y-sync binding isn't ready: the comment is then saved with the absolute pair
 * only (today's behaviour) rather than with a bogus anchor.
 */
export function encodeCommentAnchor(state: EditorState, from: number, to: number): { relFrom: string; relTo: string } | null {
  const y = ySync(state);
  if (!y || to <= from) return null;
  try {
    return {
      relFrom: toBase64(Y.encodeRelativePosition(absPosToRelPos(from, y.type, y.binding!.mapping, 0))),
      relTo: toBase64(Y.encodeRelativePosition(absPosToRelPos(to, y.type, y.binding!.mapping, -1))),
    };
  } catch {
    return null; // absPosToRelPos throws on an unexpected doc shape — save the absolute pair alone
  }
}

// CS-15 — whitespace-tolerant so a reflow (extra spaces / trailing space) alone never flags "modifié".
const normalizeQuote = (s: string) => s.trim().replace(/\s+/g, ' ');
/** CS-15 — true when a comment's live anchored text differs from its stored `quote` (before vs after). */
export function quoteChanged(quote: string, current: string): boolean {
  return normalizeQuote(quote) !== normalizeQuote(current);
}

// CS-5 mis-tag fix — cap a highlight's `to` at the end of the text block that contains `from`. `to` is
// left-associated, so when it sits at a block boundary an insert into the FOLLOWING block grows it to
// swallow that new text; a CORRECTION filed on the description then overshoots into the dialogue and
// ProseMirror merges its `ep-correction-highlight` class onto a plain comment's span there.
//   IMPORTANT: this is applied ONLY to correction highlights. A correction can't legitimately extend the
// tag into a neighbouring field, so bounding it to its own block removes the bleed with no downside. A
// PLAIN comment keeps the Docs-like "typing inside grows the highlight" contract completely untouched
// (CS-15 inside-edit-extends), because a plain highlight never carries the tag and so can never mis-tag.
function clampHighlightToBlock(doc: PMNode, from: number, to: number): number {
  const $from = doc.resolve(from);
  const blockEnd = $from.end($from.depth); // end of `from`'s enclosing textblock content
  return Math.min(to, blockEnd);
}

function buildDecos(anchors: Anchor[], y: YSyncState, doc: PMNode): DecorationSet {
  const size = doc.content.size;
  const decos: Decoration[] = [];
  for (const a of anchors) {
    const from = relativePositionToAbsolutePosition(y.doc, y.type, a.from, y.binding!.mapping);
    let to = relativePositionToAbsolutePosition(y.doc, y.type, a.to, y.binding!.mapping);
    if (from == null || to == null || to <= from || from < 0 || to > size) continue;
    if (a.correction) to = clampHighlightToBlock(doc, from, to); // corrections only — see helper note
    if (to <= from) continue;
    // keep .ep-comment-highlight for shape (radius, wrap cloning); override the wash + underline colour.
    decos.push(
      Decoration.inline(from, to, {
        class: a.correction ? 'ep-comment-highlight ep-correction-highlight' : 'ep-comment-highlight',
        style: `background:color-mix(in srgb, ${a.color} 24%, transparent);border-bottom-color:${a.color}`,
      }),
    );
  }
  return DecorationSet.create(doc, decos);
}

// Best-effort absolute paint used only until the y-sync binding is ready (first paint before sync).
function buildAbsolute(ranges: CommentRange[], doc: PMNode): DecorationSet {
  const size = doc.content.size;
  const decos = ranges
    .filter((r) => r.from >= 0 && r.to <= size && r.to > r.from)
    .map((r) => {
      const c = r.color ?? COMMENT_HIGHLIGHT_COLORS[0];
      const to = r.correction ? clampHighlightToBlock(doc, r.from, r.to) : r.to; // corrections only
      if (to <= r.from) return null;
      return Decoration.inline(r.from, to, {
        class: r.correction ? 'ep-comment-highlight ep-correction-highlight' : 'ep-comment-highlight',
        style: `background:color-mix(in srgb, ${c} 24%, transparent);border-bottom-color:${c}`,
      });
    })
    .filter((d): d is Decoration => d !== null);
  return DecorationSet.create(doc, decos);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentHighlight: {
      /** Replace the set of highlighted comment ranges (positions absolute against the current doc). */
      setCommentHighlights: (ranges: CommentRange[]) => ReturnType;
    };
  }
}

export const CommentHighlight = Extension.create({
  name: 'commentHighlight',
  addCommands() {
    return {
      setCommentHighlights:
        (ranges: CommentRange[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(commentHighlightKey, ranges));
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: commentHighlightKey,
        state: {
          init: () => ({ anchors: [], pending: null, set: DecorationSet.empty }),
          apply(tr, old, _oldState, newState): HighlightState {
            const meta = tr.getMeta(commentHighlightKey) as CommentRange[] | undefined;
            const y = ySync(newState);
            // Desired ranges (absolute) — a fresh set from the effect, or whatever's still pending.
            const desired = meta ?? old.pending;

            // No binding yet: paint absolute as a fallback and keep the desired ranges pending.
            if (!y) {
              if (desired) return { anchors: old.anchors, pending: desired, set: buildAbsolute(desired, tr.doc) };
              if (!tr.docChanged) return old;
              return { ...old, set: old.set.map(tr.mapping, tr.doc) };
            }

            // Binding is ready. If we have desired ranges, (re)derive anchors — reusing each existing
            // anchor's relative positions by id so re-painting the list can't shift older highlights;
            // only genuinely new ids are converted from their (current, correct) absolute positions.
            let anchors = old.anchors;
            if (desired) {
              const byId = new Map(old.anchors.map((a) => [a.id, a]));
              // CS-22 follow-up — a row with a durable pair is admitted regardless of its (drifted)
              // absolute bounds; a row without one still needs bounds that make sense, because
              // converting it is the only way to anchor it.
              const inBounds = (r: CommentRange) => r.from >= 0 && r.to <= tr.doc.content.size && r.to > r.from;
              anchors = desired
                .filter((r) => (r.relFrom != null && r.relTo != null) || inBounds(r))
                .map((r) => {
                  const prev = byId.get(r.id);
                  const color = r.color ?? COMMENT_HIGHLIGHT_COLORS[0];
                  const correction = r.correction ?? false;
                  if (prev) return { ...prev, color, correction }; // keep the anchor, refresh colour/tag
                  // CS-15 — `from` right-associated, `to` left-associated: typing inside the range grows
                  // the highlight; typing at either outer boundary stays outside (Docs-like).
                  // CS-22 — prefer the PERSISTED relative pair (it hasn't drifted); only a missing or
                  // unusable payload falls back to converting the stored absolute pair, as before.
                  const from = decodeRelPos(r.relFrom) ?? tryAbsPosToRelPos(r.from, y, 0);
                  const to = decodeRelPos(r.relTo) ?? tryAbsPosToRelPos(r.to, y, -1);
                  return from && to ? { id: r.id, color, correction, from, to } : null;
                })
                .filter((a): a is Anchor => a !== null);
            } else if (!tr.docChanged && old.pending === null) {
              return old; // nothing changed and nothing pending — reuse the current set
            }
            return { anchors, pending: null, set: buildDecos(anchors, y, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return commentHighlightKey.getState(state)?.set;
          },
        },
      }),
    ];
  },
});

/** CS-15 — the current text under each live comment anchor (id → text), for the sidebar "· modifié"
 *  indicator. A collapsed / unresolvable range (its commented text was fully deleted) yields `''`.
 *  Case-level comments carry no anchor, so they never appear in the map (the sidebar shows them plain).
 *  Same resolution + guards as `buildDecos`, so it tracks local AND remote edits transaction-by-transaction. */
/** CS-22 follow-up — the live absolute range of one comment's anchor, or null when it has no anchor in
 *  this editor (unknown id, binding not ready) or the anchored text is gone. « voir dans le texte » used
 *  the STORED absolute pair, which is the pair that has drifted by every edit since the comment was
 *  filed — so on an old row the jump selected the wrong words while the highlight, resolved from the
 *  durable anchor, sat correctly a few characters away. Same resolution as `buildDecos`, so the jump and
 *  the paint can never disagree. A null tells the caller to fall back to the stored pair, as before. */
export function resolveCommentRange(state: EditorState, id: string): { from: number; to: number } | null {
  const hs = commentHighlightKey.getState(state);
  const y = ySync(state);
  if (!hs || !y) return null;
  const a = hs.anchors.find((x) => x.id === id);
  if (!a) return null;
  const size = state.doc.content.size;
  const from = relativePositionToAbsolutePosition(y.doc, y.type, a.from, y.binding!.mapping);
  const to = relativePositionToAbsolutePosition(y.doc, y.type, a.to, y.binding!.mapping);
  if (from == null || to == null || to <= from || from < 0 || to > size) return null;
  return { from, to };
}

export function resolveCommentTexts(state: EditorState): Map<string, string> {
  const out = new Map<string, string>();
  const hs = commentHighlightKey.getState(state);
  const y = ySync(state);
  if (!hs || !y) return out;
  const size = state.doc.content.size;
  for (const a of hs.anchors) {
    const from = relativePositionToAbsolutePosition(y.doc, y.type, a.from, y.binding!.mapping);
    const to = relativePositionToAbsolutePosition(y.doc, y.type, a.to, y.binding!.mapping);
    out.set(a.id, from == null || to == null || to <= from || from < 0 || to > size ? '' : state.doc.textBetween(from, to, ' '));
  }
  return out;
}
