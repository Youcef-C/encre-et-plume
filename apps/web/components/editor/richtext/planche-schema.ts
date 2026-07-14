// CS-4 — the structured planche→case document schema (D6). One editor document = one planche.
//   doc            → caseBlock+
//   caseBlock{no}  → caseDescription caseDialogue   (isolating: edits can't cross case boundaries)
//   caseDescription→ block+   (rich text; renders the italic "Description —" prefix via CSS)
//   caseDialogue   → block+   (rich text: RIN — « … »)
// caseBlock is `isolating` so Backspace/Enter at block edges can never merge two cases — the
// "structure preserved on edit" acceptance criterion becomes a schema guarantee, not app code.
import { Extension, Node } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import type { Editor, Extensions, JSONContent } from '@tiptap/react';
import { CommentHighlight } from './comment-highlight';
import { PaginationExtension } from './pagination';

/** Top-level document: a planche is an ordered list of cases. Replaces StarterKit's Document
 *  (disabled via buildRichTextExtensions({ ownDocument: true })). `caseBlock+` keeps at least one
 *  case so the editor always has a valid cursor position — a truly empty planche has no inline content
 *  to place the caret in. Item 19's remove control therefore works for any case when 2+ exist and is a
 *  no-op on the last one; a case-free document is Prose mode (which hides the case scaffolding). */
const PlancheDocument = Node.create({ name: 'doc', topNode: true, content: 'caseBlock+' });

const CaseDescription = Node.create({
  name: 'caseDescription',
  group: 'caseChild',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-case-description]' }],
  renderHTML: () => ['div', { 'data-case-description': '', class: 'ep-case-description' }, 0],
});

const CaseDialogue = Node.create({
  name: 'caseDialogue',
  group: 'caseChild',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-case-dialogue]' }],
  renderHTML: () => ['div', { 'data-case-dialogue': '', class: 'ep-case-dialogue' }, 0],
});

const CaseBlock = Node.create({
  name: 'caseBlock',
  content: 'caseDescription caseDialogue',
  isolating: true,
  addAttributes() {
    return {
      no: {
        default: 1,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-case-no')) || 1,
        renderHTML: (attrs) => ({ 'data-case-no': String(attrs.no) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-case-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-case-block': '', class: 'ep-case-block' }, 0];
  },
  // Item 19 — a per-case "Supprimer la case" button, drawn as a NodeView so it sits inside each A4
  // sheet (contentEditable=false; the case fields stay editable in contentDOM). The TrashIcon SVG is
  // inlined (NodeViews are plain DOM, not React) to match the shared icon strokes.
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'ep-case-block';
      dom.setAttribute('data-case-block', '');
      dom.setAttribute('data-case-no', String(node.attrs.no));

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ep-case-remove';
      btn.setAttribute('contenteditable', 'false');
      btn.setAttribute('aria-label', `Supprimer la case ${node.attrs.no}`);
      btn.setAttribute('title', 'Supprimer la case');
      btn.innerHTML = TRASH_SVG;
      // mousedown (not click) + preventDefault keeps the editor selection stable before we delete.
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        removeCase(editor, pos);
      });

      const contentDOM = document.createElement('div');
      contentDOM.className = 'ep-case-content';
      contentDOM.setAttribute('data-case-no', String(node.attrs.no)); // feeds the "CASE N" CSS label

      // Item 24 — TRUE content-reflow pagination: an empty frame layer that the PaginationExtension
      // (pagination.ts) fills with one bordered A4 "sheet" per page. Content taller than one page is
      // pushed onto the next frame (with a real inter-sheet gap) by widget-decoration spacers, so long
      // text visibly starts a new page instead of flowing across the boundary. The layer is a sibling
      // of the editable content (contentEditable=false, pointer-events:none, behind the text), so the
      // ProseMirror doc / Yjs CRDT are never touched and the caret stays put on Enter at a boundary.
      const frames = document.createElement('div');
      frames.className = 'ep-page-frames';
      frames.setAttribute('contenteditable', 'false');
      frames.setAttribute('aria-hidden', 'true');
      // Seed one page-1 frame so the A4 sheet border shows immediately, before pagination.ts measures.
      frames.appendChild(Object.assign(document.createElement('div'), { className: 'ep-page-frame' }));

      dom.appendChild(frames);
      dom.appendChild(btn);
      dom.appendChild(contentDOM);
      return {
        dom,
        contentDOM,
        ignoreMutation: (m) => m.target === frames || frames.contains(m.target as unknown as globalThis.Node) || !contentDOM.contains(m.target as unknown as globalThis.Node),
      };
    };
  },
});

// TrashIcon (icons.tsx) inlined for the NodeView's plain-DOM delete button.
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="4 6.5 20 6.5"/>' +
  '<path d="M8.5 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2"/>' +
  '<path d="M6 6.5l1 13a1.6 1.6 0 0 0 1.6 1.5h6.8a1.6 1.6 0 0 0 1.6-1.5l1-13"/>' +
  '<line x1="10" y1="10.5" x2="10" y2="17.5"/><line x1="14" y1="10.5" x2="14" y2="17.5"/></svg>';

/** Append a fresh empty case at the end of the planche and focus its description. */
export function appendCase(editor: Editor): void {
  const nextNo = editor.state.doc.childCount + 1;
  const pos = editor.state.doc.content.size;
  editor.chain().insertContentAt(pos, emptyCaseJson(nextNo)).focus(pos + 3).run();
}

/** Item 19 — remove the caseBlock at `pos`, then renumber the survivors 1..N so the "CASE N" labels
 *  and comment anchors stay contiguous (and appendCase's next-number is never a collision). */
export function removeCase(editor: Editor, pos: number): void {
  if (editor.state.doc.childCount <= 1) return; // keep at least one case (schema: caseBlock+)
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'caseBlock') return;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  // Land the caret in the nearest text before the removed case so focus/scroll stay put.
  const near = Selection.findFrom(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1, true);
  if (near) tr.setSelection(near);
  editor.view.dispatch(tr);
  renumberCases(editor);
}

/** Set each caseBlock's `no` to its 1-based position. */
export function renumberCases(editor: Editor): void {
  const tr = editor.state.tr;
  let i = 0;
  editor.state.doc.forEach((child, offset) => {
    if (child.type.name === 'caseBlock') {
      i += 1;
      if (child.attrs.no !== i) tr.setNodeAttribute(offset, 'no', i);
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

// Item 25 — Backspace at the start of an EMPTY case-field line would default-`joinBackward`, flinging
// the caret into the previous field/case and scrolling the view up (users hit it while "erasing" the
// Dialogue… placeholder at the bottom of a page). There's nothing to delete there, so consume the key:
// the caret and scroll position stay put. Only fires on the first empty line of a case field.
const CaseFieldGuard = Extension.create({
  name: 'caseFieldGuard',
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false;
        const fieldDepth = $from.depth - 1;
        if (fieldDepth < 0) return false;
        const fieldName = $from.node(fieldDepth).type.name;
        if (fieldName !== 'caseDescription' && fieldName !== 'caseDialogue') return false;
        return $from.index(fieldDepth) === 0; // first (empty) line of the field → keep caret put
      },
    };
  },
});

/** Case-block schema extensions layered on top of the shared rich-text core. */
export const plancheExtensions: Extensions = [PlancheDocument, CaseBlock, CaseDescription, CaseDialogue, CaseFieldGuard, CommentHighlight, PaginationExtension];

/** Item 6 — per-field placeholder: an empty case description shows "Description…", an empty dialogue
 *  shows "Dialogue…", so the field's purpose persists when it's blank.
 *
 *  Item 18 — the label decorates ONLY the field's FIRST block while the whole field is still empty.
 *  The Placeholder extension (includeChildren:true) decorates every empty textblock, so without this
 *  guard pressing Enter — which adds empty paragraphs — repainted "Dialogue…" on every new empty line
 *  ("written again and again"). Returning '' leaves those extra lines blank (decoration only, never
 *  serialized into the doc/Yjs). */
export function casePlaceholder({ editor, pos, prose }: { editor: Editor; pos: number; prose?: boolean }): string {
  // Item 26 — in prose mode the case scaffolding is hidden and the doc reads as one plain body: no
  // Description/Dialogue labels at all.
  if (prose) return '';
  const doc = editor.state.doc;
  const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    const name = node.type.name;
    if (name === 'caseDescription' || name === 'caseDialogue') {
      // Items 18 & 23 — the label decorates ONLY the field's first block, and ONLY while the whole
      // field is genuinely empty; a field WITH text (even in another line) shows no ghost label.
      if (node.textContent.length > 0) return '';
      if ($pos.index(d) !== 0) return ''; // a later empty line in the field → blank, not a repeat
      return name === 'caseDescription' ? 'Description…' : 'Dialogue…';
    }
  }
  return 'Écrivez votre scénario…';
}

/** A single empty case (used to seed a blank scenario and by addCase). */
export function emptyCaseJson(no: number): JSONContent {
  return {
    type: 'caseBlock',
    attrs: { no },
    content: [
      { type: 'caseDescription', content: [{ type: 'paragraph' }] },
      { type: 'caseDialogue', content: [{ type: 'paragraph' }] },
    ],
  };
}

/** A blank one-case planche — the starting document for a brand-new scenario. */
export function blankPlancheDoc(): JSONContent {
  return { type: 'doc', content: [emptyCaseJson(1)] };
}
