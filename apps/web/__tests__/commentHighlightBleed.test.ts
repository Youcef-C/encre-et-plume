import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { buildRichTextExtensions } from '../components/editor/richtext/core';
import { plancheExtensions, casePlaceholder } from '../components/editor/richtext/planche-schema';
import { commentHighlightKey } from '../components/editor/richtext/comment-highlight';

// CS-5 Bug #1 (QA) — a PLAIN comment's highlight must NOT inherit `ep-correction-highlight` from an
// unrelated correction filed just before it in the SAME case block. Root cause: a left-associated `to`
// sitting at a block boundary GROWS to swallow text later typed into the following field, so the
// correction highlight overshoots into the dialogue and ProseMirror merges its correction class onto
// the plain comment's span there. Reproduced with a real TipTap+Yjs editor (the flag mapping is already
// per-id-correct; the bleed only appears once decorations render over overlapping absolute ranges).

function makeEditor(ydoc: Y.Doc): Editor {
  return new Editor({
    extensions: [
      ...buildRichTextExtensions({ collab: true, ownDocument: true, placeholder: casePlaceholder }),
      ...plancheExtensions,
      Collaboration.configure({ document: ydoc }),
    ],
  });
}

function correctionSpanCount(editor: Editor): number {
  return editor.view.dom.querySelectorAll('.ep-correction-highlight').length;
}

describe('correction highlight does not bleed onto an adjacent plain comment', () => {
  it('the plain comment in the dialogue is not tagged when a correction was filed on the description first', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    // One case block: a filled description, an empty dialogue (the classic "file a correction on the
    // description, then comment on the dialogue" QA flow).
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'caseBlock',
            attrs: { no: 1 },
            content: [
              { type: 'caseDescription', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rin entre dans le sanctuaire.' }] }] },
              { type: 'caseDialogue', content: [{ type: 'paragraph' }] },
            ],
          },
        ],
      },
      { emitUpdate: false },
    );

    // Correction range = the whole description line, its `to` landing at the (empty) dialogue boundary —
    // exactly what a Home/Shift+End whole-line selection followed by "Demander une correction" produces.
    const descStart = 3;
    let dlgContentStart = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'caseDialogue' && dlgContentStart < 0) dlgContentStart = pos + 2;
    });
    const correctionTo = dlgContentStart; // `to` at the block boundary → the growth trigger

    // Paint the correction first (as the live flow does, before the dialogue is written).
    editor.commands.setCommentHighlights([
      { id: 'corr', from: descStart, to: correctionTo, color: '#e8261c', correction: true },
    ]);
    expect(correctionSpanCount(editor)).toBe(1);

    // The user clicks into the empty dialogue and types a reply.
    editor.chain().insertContentAt(dlgContentStart, 'Une réplique à commenter.').run();

    // Then anchors a PLAIN comment on that dialogue text.
    let plainStart = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'text' && node.text?.includes('Une réplique') && plainStart < 0) plainStart = pos;
    });
    editor.commands.setCommentHighlights([
      { id: 'corr', from: descStart, to: correctionTo, color: '#e8261c', correction: true },
      { id: 'plain', from: plainStart, to: plainStart + 12, color: '#1c86e8', correction: false },
    ]);

    // The correction tag must stay on its OWN highlight only — exactly one span, inside the description.
    expect(correctionSpanCount(editor)).toBe(1);
    const dialogueHighlights = editor.view.dom.querySelectorAll('[data-case-dialogue] .ep-comment-highlight');
    dialogueHighlights.forEach((el) => expect(el.getAttribute('class')).not.toMatch(/ep-correction-highlight/));

    // Sanity: the highlight state still carries both comments (the correction one flagged, the plain not).
    const set = commentHighlightKey.getState(editor.state)?.set;
    expect(set).toBeTruthy();
    editor.destroy();
  });
});
