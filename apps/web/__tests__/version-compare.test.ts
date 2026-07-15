// CS-5 (iter 6) C8 — annotateCompare marks what changed between two SERVER-SANITIZED version HTMLs,
// reusing the shared textdiff. Added/removed are conveyed as <ins>/<del> + a "+"/"-" marker AND as
// sr-only text ("Ajoute :" / "Supprime :") so the diff is not colour-only (a11y). jsdom has DOMParser.
import { describe, it, expect } from 'vitest';
import { annotateCompare } from '../components/editeur/version-compare';

describe('annotateCompare', () => {
  it('marks an added block on the RIGHT pane, leaving the LEFT untouched', () => {
    const from = '<div class="ep-case-block"><p>Ligne un</p></div>';
    const to = '<div class="ep-case-block"><p>Ligne un</p><p>Ligne deux</p></div>';
    const { from: fa, to: ta } = annotateCompare(from, to);
    expect(fa).not.toContain('ep-diff-ins');
    expect(ta).toContain('ep-diff-ins');
    expect(ta).toMatch(/Ajouté ?:/);
  });

  it('marks a removed block on the LEFT pane with a "Supprime :" label', () => {
    const from = '<div class="ep-case-block"><p>Un</p><p>Deux</p></div>';
    const to = '<div class="ep-case-block"><p>Un</p></div>';
    const { from: fa } = annotateCompare(from, to);
    expect(fa).toContain('ep-diff-del');
    expect(fa).toMatch(/Supprimé ?:/);
  });

  it('does word-level <del>/<ins> on a changed line', () => {
    const from = '<div class="ep-case-block"><p>le chat noir</p></div>';
    const to = '<div class="ep-case-block"><p>le chien noir</p></div>';
    const { from: fa, to: ta } = annotateCompare(from, to);
    expect(fa).toContain('<del>chat</del>');
    expect(ta).toContain('<ins>chien</ins>');
    expect(fa).toContain('le');
    expect(ta).toContain('noir');
  });

  it('leaves identical content unmarked and preserves inline formatting', () => {
    const html = '<div class="ep-case-block"><p>Bonjour <strong>gras</strong></p></div>';
    const { from: fa, to: ta } = annotateCompare(html, html);
    expect(fa).not.toContain('ep-diff-');
    expect(ta).not.toContain('ep-diff-');
    expect(fa).toContain('<strong>gras</strong>');
  });
});
