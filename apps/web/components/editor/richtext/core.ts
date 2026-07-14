// CS-4 / AD-8 — shared rich-text core. Planche-FREE on purpose: AD-8's article editor reuses this
// same base so both editors feel consistent (headings/styles, B/I/U/S, color/highlight, alignment,
// lists, blockquote, link, clear-format, undo/redo). The CS-4 planche editor layers the case-block
// schema (planche-schema.ts) on top of this.
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import type { Extensions, Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Per-node placeholder resolver (TipTap Placeholder signature). CS-4 uses it so each empty case
 *  field shows its own label ("Description…" / "Dialogue…"); AD-8 passes a plain string. */
export type PlaceholderResolver = (props: {
  editor: Editor;
  node: ProseMirrorNode;
  pos: number;
  hasAnchor: boolean;
}) => string;

export interface RichTextCoreOptions {
  /** When collaborating, StarterKit's local undo/redo history MUST be off (Yjs owns history and
   *  provides its own undo/redo commands via @tiptap/extension-collaboration). */
  collab?: boolean;
  /** Disable StarterKit's Document node so a custom top-level schema (planche) can replace it. */
  ownDocument?: boolean;
  /** Empty-state guidance shown by the Placeholder extension (decoration only, never serialized).
   *  A plain string shows on the first empty block; a resolver picks a label per empty node. */
  placeholder?: string | PlaceholderResolver;
}

// Text-align applies to headings, paragraphs, and the planche case blocks.
export const TEXT_ALIGN_TYPES = ['heading', 'paragraph', 'caseDescription', 'caseDialogue'];

/** Heading levels offered by the "Style ▾" menu (Titre 1 / 2 / 3). */
export const HEADING_LEVELS = [1, 2, 3] as const;

/** Default highlight colour used by the "Surligner" toggle. */
export const HIGHLIGHT_DEFAULT = '#f5e663';

/**
 * The AD-8-reusable extension set: StarterKit (bold/italic/underline/strike, bullet + ordered lists,
 * blockquote, link, headings for "Style ▾") + TextAlign + TextStyle/Color + Highlight + Placeholder.
 * StarterKit v3 already bundles Underline, Link, Blockquote and the lists.
 */
export function buildRichTextExtensions(opts: RichTextCoreOptions = {}): Extensions {
  const ph = opts.placeholder;
  const placeholder: string | PlaceholderResolver =
    typeof ph === 'function' ? ph : ({ pos }) => (pos <= 2 ? (ph ?? '') : '');
  return [
    StarterKit.configure({
      // Yjs is the single source of truth for history when collaborating; its own undo/redo commands
      // (from @tiptap/extension-collaboration) drive the Annuler/Rétablir toolbar buttons.
      ...(opts.collab ? { undoRedo: false } : {}),
      // The planche schema provides its own Document (content: caseBlock+).
      ...(opts.ownDocument ? { document: false } : {}),
      heading: { levels: [...HEADING_LEVELS] },
      link: { openOnClick: false, autolink: true },
    }),
    TextAlign.configure({ types: TEXT_ALIGN_TYPES }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      // A resolver (CS-4) labels each empty field; a plain string (AD-8) shows only on the first
      // empty block so the sheet doesn't fill with ghost text. Decoration only — never serialized.
      // includeChildren:false → only leaf text blocks are decorated (no duplicate on the container).
      placeholder,
      showOnlyWhenEditable: true,
      // Decorate EVERY empty text block, not just the focused one, so each case field keeps its
      // label persistently (item 6). Two nesting gotchas in @tiptap/extensions' Placeholder:
      //  • showOnlyCurrent:true takes a "resolved depth-1" fast path that assumes a flat doc and
      //    silently skips our nested planche (caseBlock at depth 1 isn't a textblock) → false.
      //  • the full scan won't descend into non-textblock containers unless includeChildren:true;
      //    our paragraphs live 3 deep under caseBlock/caseDescription, so it must recurse. Only
      //    textblocks are decorated — containers are skipped before the decoration is pushed.
      showOnlyCurrent: false,
      includeChildren: true,
    }),
  ];
}
