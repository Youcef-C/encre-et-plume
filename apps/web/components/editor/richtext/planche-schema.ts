// CS-4 — the structured planche→case document schema (D6). One editor document = one planche.
//   doc            → caseBlock+
//   caseBlock{no}  → caseDescription caseDialogue   (isolating: edits can't cross case boundaries)
//   caseDescription→ block+   (rich text; renders the italic "Description —" prefix via CSS)
//   caseDialogue   → block+   (rich text: RIN — « … »)
// caseBlock is `isolating` so Backspace/Enter at block edges can never merge two cases — the
// "structure preserved on edit" acceptance criterion becomes a schema guarantee, not app code.
import { Node } from '@tiptap/core';
import type { Editor, Extensions, JSONContent } from '@tiptap/react';

/** Top-level document: a planche is an ordered list of cases. Replaces StarterKit's Document
 *  (disabled via buildRichTextExtensions({ ownDocument: true })). */
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
});

/** Append a fresh empty case at the end of the planche and focus its description. */
export function appendCase(editor: Editor): void {
  const nextNo = editor.state.doc.childCount + 1;
  const pos = editor.state.doc.content.size;
  editor.chain().insertContentAt(pos, emptyCaseJson(nextNo)).focus(pos + 3).run();
}

/** Case-block schema extensions layered on top of the shared rich-text core. */
export const plancheExtensions: Extensions = [PlancheDocument, CaseBlock, CaseDescription, CaseDialogue];

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
