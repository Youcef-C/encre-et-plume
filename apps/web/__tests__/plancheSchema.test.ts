import { describe, it, expect } from 'vitest';
import { blankPlancheDoc, emptyCaseJson, plancheExtensions } from '../components/editor/richtext/planche-schema';

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

  it('exports the four planche nodes (doc, caseBlock, caseDescription, caseDialogue)', () => {
    const names = plancheExtensions.map((e) => e.name).sort();
    expect(names).toEqual(['caseBlock', 'caseDescription', 'caseDialogue', 'doc']);
  });
});
