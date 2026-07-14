import { describe, it, expect } from 'vitest';
import type { Editor } from '@tiptap/react';
import { blankPlancheDoc, emptyCaseJson, plancheExtensions, casePlaceholder } from '../components/editor/richtext/planche-schema';

// A fake editor whose resolve() returns a $pos with the given ancestor node-type chain
// (index = depth), mimicking ProseMirror's ResolvedPos for the placeholder resolver. `fieldText` is
// the resolved field's textContent and `fieldIndex` the decorated block's index within the field
// (item 18 — only the first empty block of an empty field is labelled).
function fakeEditor(chain: string[], fieldText = '', fieldIndex = 0): Editor {
  const $pos = {
    depth: chain.length - 1,
    node: (d: number) => ({ type: { name: chain[d] }, textContent: fieldText }),
    index: () => fieldIndex,
  };
  return { state: { doc: { content: { size: 100 }, resolve: () => $pos } } } as unknown as Editor;
}

describe('planche schema', () => {
  it('blankPlancheDoc is a doc with a single CASE 1 (description + dialogue)', () => {
    const doc = blankPlancheDoc();
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
    const c = doc.content![0];
    expect(c.type).toBe('caseBlock');
    expect(c.attrs).toEqual({ no: 1 });
    expect(c.content!.map((n) => n.type)).toEqual(['caseDescription', 'caseDialogue']);
  });

  it('emptyCaseJson numbers the case and seeds empty paragraphs', () => {
    const c = emptyCaseJson(3);
    expect(c.attrs).toEqual({ no: 3 });
    expect(c.content).toHaveLength(2);
    expect(c.content![0].content![0].type).toBe('paragraph');
  });

  // F-I5 / U5 — a fresh scenario must be GENUINELY empty: no "Planche 1/9" / "Case 1" filler baked
  // into the stored document JSON. The CASE label + Description prefix are CSS chrome, never text.
  it('a fresh blank doc has zero stored text — no "Planche"/"Case" filler', () => {
    // Case-sensitive: the filler was "Planche 1/9" / "Case 1" (capitals); the schema's own node
    // type names are lowercase ("caseBlock"), so they don't count as stored copy.
    const json = JSON.stringify(blankPlancheDoc());
    expect(json).not.toContain('Planche');
    expect(json).not.toContain('Case');
    // no `text` nodes at all in a fresh doc
    expect(json).not.toContain('"type":"text"');
  });

  it('exports the planche nodes + the case-field key guard', () => {
    const names = plancheExtensions.map((e) => e.name).sort();
    expect(names).toEqual(['caseBlock', 'caseDescription', 'caseDialogue', 'caseFieldGuard', 'commentHighlight', 'doc', 'epPagination']);
  });

  // Item 6 — an empty field keeps its label via a per-field placeholder.
  describe('casePlaceholder', () => {
    it('labels an empty description field "Description…"', () => {
      const editor = fakeEditor(['doc', 'caseBlock', 'caseDescription', 'paragraph']);
      expect(casePlaceholder({ editor, pos: 3 })).toBe('Description…');
    });
    it('labels an empty dialogue field "Dialogue…"', () => {
      const editor = fakeEditor(['doc', 'caseBlock', 'caseDialogue', 'paragraph']);
      expect(casePlaceholder({ editor, pos: 7 })).toBe('Dialogue…');
    });
    it('falls back to the scenario guidance outside a case field', () => {
      const editor = fakeEditor(['doc', 'paragraph']);
      expect(casePlaceholder({ editor, pos: 1 })).toBe('Écrivez votre scénario…');
    });

    // Item 18 — pressing Enter adds empty paragraphs; the label must NOT repeat on each of them.
    it('does not repeat the label on a later empty line of the same field', () => {
      const editor = fakeEditor(['doc', 'caseBlock', 'caseDialogue', 'paragraph'], '', 1);
      expect(casePlaceholder({ editor, pos: 9 })).toBe('');
    });
    it('shows no label once the field has text', () => {
      const editor = fakeEditor(['doc', 'caseBlock', 'caseDescription', 'paragraph'], 'Il pleut', 0);
      expect(casePlaceholder({ editor, pos: 3 })).toBe('');
    });
  });
});
