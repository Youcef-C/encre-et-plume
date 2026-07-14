import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { buildRichTextExtensions } from '../components/editor/richtext/core';
import {
  plancheExtensions,
  blankPlancheDoc,
  casePlaceholder,
  appendCase,
  removeCase,
  emptyCaseJson,
} from '../components/editor/richtext/planche-schema';

// Item 18 regression — the per-field placeholder ("Description…" / "Dialogue…") must be a
// ProseMirror decoration ONLY. It must never be serialized into getJSON()/getHTML() nor into the
// Yjs document, and must not accumulate across a "page switch" (fresh editor seeded, serialized,
// re-seeded from the previous serialization, as the app does over the WS/DB round-trip).

function makeEditor(ydoc: Y.Doc): Editor {
  return new Editor({
    extensions: [
      ...buildRichTextExtensions({ collab: true, ownDocument: true, placeholder: casePlaceholder }),
      ...plancheExtensions,
      Collaboration.configure({ document: ydoc }),
    ],
  });
}

const PLACEHOLDERS = ['Description…', 'Dialogue…', 'Écrivez votre scénario…'];

function assertNoPlaceholder(editor: Editor) {
  const json = JSON.stringify(editor.getJSON());
  const html = editor.getHTML();
  for (const ph of PLACEHOLDERS) {
    expect(json).not.toContain(ph);
    expect(html).not.toContain(ph);
  }
}

describe('planche placeholder is never persisted (item 18)', () => {
  it('a freshly-seeded blank planche has no placeholder text in doc/Yjs', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    assertNoPlaceholder(editor);
    // The Yjs fragment itself must not carry the placeholder text either.
    expect(ydoc.getXmlFragment('default').toString()).not.toContain('Description…');
    editor.destroy();
  });

  it('does not accumulate placeholder text across simulated page switches', () => {
    // Page 1: fresh editor + ydoc, seed blank, edit nothing (leave fields empty → placeholders show).
    const doc1 = new Y.Doc();
    const ed1 = makeEditor(doc1);
    ed1.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    const json1 = ed1.getJSON();
    assertNoPlaceholder(ed1);
    ed1.destroy();

    // Page switch → back: a fresh editor/ydoc seeded from page 1's saved JSON (the DB projection).
    for (let i = 0; i < 3; i++) {
      const doc = new Y.Doc();
      const ed = makeEditor(doc);
      ed.commands.setContent(json1, { emitUpdate: false });
      assertNoPlaceholder(ed);
      ed.destroy();
    }
  });

  it('keeps placeholder out of content after typing then clearing a field', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    editor.commands.insertContent('Salut');
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    assertNoPlaceholder(editor);
    editor.destroy();
  });

  it('labels only the first empty line of a field, not every one (item 18)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    // A description field with THREE empty paragraphs (as pressing Enter twice would produce).
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'caseBlock',
            attrs: { no: 1 },
            content: [
              { type: 'caseDescription', content: [{ type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }] },
              { type: 'caseDialogue', content: [{ type: 'paragraph' }] },
            ],
          },
        ],
      },
      { emitUpdate: false },
    );
    const labels = new Set<string>();
    let descEmpties = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph' || node.content.size !== 0) return;
      const $pos = editor.state.doc.resolve(pos);
      const inDescription = $pos.node($pos.depth).type.name === 'caseDescription';
      if (!inDescription) return;
      descEmpties += 1;
      const ph = casePlaceholder({ editor, pos });
      if (ph) labels.add(`${pos}:${ph}`);
    });
    expect(descEmpties).toBe(3); // three empty lines in the field
    expect([...labels]).toEqual([...labels].filter((l) => l.endsWith('Description…')));
    expect(labels.size).toBe(1); // …only the first is labelled
    assertNoPlaceholder(editor);
    editor.destroy();
  });

  it('shows no "Dialogue…" placeholder once the dialogue field has text (item 23)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'caseBlock',
            attrs: { no: 1 },
            content: [
              { type: 'caseDescription', content: [{ type: 'paragraph' }] },
              // dialogue has text in line 1 and an empty line 2.
              { type: 'caseDialogue', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }, { type: 'paragraph' }] },
            ],
          },
        ],
      },
      { emitUpdate: false },
    );
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return;
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.node($pos.depth).type.name !== 'caseDialogue') return;
      // No line of a dialogue field that already contains text may resolve to a label.
      expect(casePlaceholder({ editor, pos })).toBe('');
    });
    assertNoPlaceholder(editor);
    editor.destroy();
  });

  it('Backspace at the start of an empty case field keeps the caret put (item 25)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    // Move the caret into the empty dialogue field's first (empty) line.
    let dlgStart = -1;
    editor.state.doc.descendants((node, pos) => {
      if (dlgStart >= 0) return false;
      if (node.type.name === 'paragraph') {
        const $p = editor.state.doc.resolve(pos);
        if ($p.node($p.depth).type.name === 'caseDialogue') dlgStart = pos + 1;
      }
      return true;
    });
    editor.commands.setTextSelection(dlgStart);
    const before = editor.state.selection.from;
    const beforeChildCount = editor.state.doc.childCount;
    // Run the Backspace key through ProseMirror's handleKeyDown chain; the guard consumes it (returns
    // true) so no joinBackward fires → selection + structure unchanged.
    const event = new KeyboardEvent('keydown', { key: 'Backspace' });
    const handled = editor.view.someProp('handleKeyDown', (f) => f(editor.view, event));
    expect(handled).toBe(true);
    expect(editor.state.selection.from).toBe(before);
    expect(editor.state.doc.childCount).toBe(beforeChildCount);
    editor.destroy();
  });

  it('prose mode shows no case placeholders and never persists them (item 26)', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') expect(casePlaceholder({ editor, pos, prose: true })).toBe('');
    });
    assertNoPlaceholder(editor);
    editor.destroy();
  });
});

describe('removeCase / renumberCases (item 19)', () => {
  const nosOf = (ed: Editor): number[] => {
    const out: number[] = [];
    ed.state.doc.forEach((c) => c.type.name === 'caseBlock' && out.push(c.attrs.no as number));
    return out;
  };
  const posOfCase = (ed: Editor, n: number): number => {
    let pos = -1;
    let seen = 0;
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name === 'caseBlock') {
        seen += 1;
        if (seen === n) pos = offset;
      }
    });
    return pos;
  };

  it('removes a case and renumbers survivors 1..N; keeps at least one case', () => {
    const ydoc = new Y.Doc();
    const editor = makeEditor(ydoc);
    editor.commands.setContent(
      { type: 'doc', content: [emptyCaseJson(1), emptyCaseJson(2), emptyCaseJson(3)] },
      { emitUpdate: false },
    );
    expect(editor.state.doc.childCount).toBe(3);

    removeCase(editor, posOfCase(editor, 2)); // remove the middle case
    expect(editor.state.doc.childCount).toBe(2);
    expect(nosOf(editor)).toEqual([1, 2]); // renumbered contiguously

    // appendCase after a removal never collides on `no`.
    appendCase(editor);
    expect(nosOf(editor)).toEqual([1, 2, 3]);

    // Removing down toward the last case leaves a valid 1-case doc; the last is a no-op.
    removeCase(editor, posOfCase(editor, 3));
    removeCase(editor, posOfCase(editor, 2));
    expect(editor.state.doc.childCount).toBe(1);
    removeCase(editor, posOfCase(editor, 1)); // can't remove the only case
    expect(editor.state.doc.childCount).toBe(1);
    editor.destroy();
  });
});
