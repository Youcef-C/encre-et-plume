// CS-4 / AD-8 — shared rich-text core. Planche-FREE on purpose: AD-8's article editor reuses this
// same base so both editors feel consistent (headings/styles, B/I/U/S, color/highlight, alignment,
// lists, blockquote, link, clear-format, undo/redo). The CS-4 planche editor layers the case-block
// schema (planche-schema.ts) on top of this.
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import type { Extensions } from '@tiptap/react';

export interface RichTextCoreOptions {
  /** When collaborating, StarterKit's local undo/redo history MUST be off (Yjs owns history and
   *  provides its own undo/redo commands via @tiptap/extension-collaboration). */
  collab?: boolean;
  /** Disable StarterKit's Document node so a custom top-level schema (planche) can replace it. */
  ownDocument?: boolean;
  /** Empty-state guidance shown by the Placeholder extension (decoration only, never serialized). */
  placeholder?: string;
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
      // Show the guidance only on the first empty text block (pos 0-ish) so the sheet doesn't fill
      // with ghost text in every empty case child. Decoration only — never serialized.
      placeholder: ({ pos }) => (pos <= 2 ? (opts.placeholder ?? '') : ''),
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
  ];
}
