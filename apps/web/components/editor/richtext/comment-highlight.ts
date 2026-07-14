// CS-4 item 5 — inline highlight decorations for range-anchored comments. Comments that carry a
// ProseMirror range (anchorFrom/anchorTo) paint an `.ep-comment-highlight` inline mark so the reader
// sees which text a comment refers to. Decoration only — never serialized into the doc/Yjs. Positions
// are best-effort (they can drift after collaborative edits); the comment's stored `quote` is the
// durable indicator, so a stale range simply stops painting rather than mis-highlighting.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface CommentRange {
  id: string;
  from: number;
  to: number;
  /** Highlight colour, assigned by message order (commentColor). Falls back to the first hue. */
  color?: string;
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
  comments: { id: string; anchorFrom: number | null; anchorTo: number | null }[],
  docSize: number,
): CommentRange[] {
  const out: CommentRange[] = [];
  for (const c of comments) {
    if (c.anchorFrom == null || c.anchorTo == null) continue;
    const from = Math.max(0, Math.min(c.anchorFrom, docSize));
    const to = Math.max(0, Math.min(c.anchorTo, docSize));
    if (to > from) out.push({ id: c.id, from, to });
  }
  return out;
}

export const commentHighlightKey = new PluginKey<DecorationSet>('commentHighlight');

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
      new Plugin<DecorationSet>({
        key: commentHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const ranges = tr.getMeta(commentHighlightKey) as CommentRange[] | undefined;
            if (ranges) {
              const size = tr.doc.content.size;
              const decos = ranges
                .filter((r) => r.from >= 0 && r.to <= size && r.to > r.from)
                .map((r) => {
                  // Per-comment colour (assigned by order via commentColor, carried on the range):
                  // keep .ep-comment-highlight for shape (radius, wrap cloning), override the wash +
                  // underline colour inline so each comment is distinguishable.
                  const c = r.color ?? COMMENT_HIGHLIGHT_COLORS[0];
                  return Decoration.inline(r.from, r.to, {
                    class: 'ep-comment-highlight',
                    style: `background:color-mix(in srgb, ${c} 24%, transparent);border-bottom-color:${c}`,
                  });
                });
              return DecorationSet.create(tr.doc, decos);
            }
            // Keep highlights aligned as the doc changes locally (best-effort mapping).
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return commentHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
