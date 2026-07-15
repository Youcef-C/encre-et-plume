'use client';

// CS-5 (iter 6) C8 — diff annotation for the "Comparer les versions" modal. Reuses the shared textdiff
// (diffLines / diffWords) to mark, over the two version HTMLs, WHAT changed: a removed block/word gets
// <del> + a "-" marker, an added one <ins> + a "+" marker; changed lines get word-level runs. Added /
// removed are ALSO announced as text (sr-only "Ajouté :" / "Supprimé :") so the diff is never
// colour-only (a11y).
//
// SECURITY INVARIANT (see VersionSheet): the inputs are ALREADY server-sanitized (api.getReview →
// sanitizeScenarioHtml). We only re-parse that sanitized HTML with an INERT DOMParser (no script exec,
// no resource load) and add code-generated <ins>/<del>/<span> nodes whose text is set via textContent
// (auto-escaped). Never feed raw editor.getHTML() / live Yjs content here — route it through the
// sanitizing endpoint first, exactly like the panes already do.
import { diffLines, diffWords, type WordDiffRun } from '@encre-et-plume/shared';

const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre';

/** Text-bearing leaf blocks in document order (a blockquote wrapping <p> yields the <p>, not both). */
function leafBlocks(root: ParentNode): HTMLElement[] {
  return (Array.from(root.querySelectorAll(BLOCK_SEL)) as HTMLElement[]).filter(
    (el) => !el.querySelector(BLOCK_SEL),
  );
}

const norm = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Whole-block add/remove: class + a visible aria-hidden marker + an sr-only text label. */
function markWhole(el: HTMLElement, kind: 'del' | 'ins') {
  const doc = el.ownerDocument;
  el.classList.add(kind === 'del' ? 'ep-diff-del' : 'ep-diff-ins');
  const sr = doc.createElement('span');
  sr.className = 'ep-diff-sr';
  sr.textContent = kind === 'del' ? 'Supprimé : ' : 'Ajouté : ';
  const marker = doc.createElement('span');
  marker.className = 'ep-diff-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = kind === 'del' ? '− ' : '+ ';
  el.insertBefore(sr, el.firstChild);
  el.insertBefore(marker, el.firstChild);
}

/** Rebuild a changed block from word runs (keeps same+its-side runs; wraps del/ins). ponytail: inline
 *  formatting on a CHANGED line is dropped — same recorded simplification the diff panes always used. */
function renderRuns(el: HTMLElement, runs: WordDiffRun[], side: 'from' | 'to') {
  const doc = el.ownerDocument;
  el.textContent = '';
  el.classList.add('ep-diff-change');
  for (const run of runs) {
    if (side === 'from' && run.kind === 'ins') continue;
    if (side === 'to' && run.kind === 'del') continue;
    if (run.kind === 'same') {
      el.appendChild(doc.createTextNode(run.text));
      continue;
    }
    const node = doc.createElement(run.kind === 'del' ? 'del' : 'ins');
    node.textContent = run.text;
    el.appendChild(node);
  }
}

/**
 * Annotate two sanitized version HTMLs with a block+word diff. Returns the annotated HTML for each pane.
 * When DOMParser is unavailable (SSR), returns the inputs unchanged.
 */
export function annotateCompare(fromHtml: string, toHtml: string): { from: string; to: string } {
  if (typeof DOMParser === 'undefined') return { from: fromHtml, to: toHtml };
  const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html');
  const fromDoc = parse(fromHtml);
  const toDoc = parse(toHtml);
  const fromB = leafBlocks(fromDoc.body);
  const toB = leafBlocks(toDoc.body);

  for (const op of diffLines(fromB.map(norm), toB.map(norm))) {
    if (op.kind === 'del' && op.aIndex != null) markWhole(fromB[op.aIndex]!, 'del');
    else if (op.kind === 'ins' && op.bIndex != null) markWhole(toB[op.bIndex]!, 'ins');
    else if (op.kind === 'change' && op.aIndex != null && op.bIndex != null) {
      const runs = diffWords(norm(fromB[op.aIndex]!), norm(toB[op.bIndex]!));
      renderRuns(fromB[op.aIndex]!, runs, 'from');
      renderRuns(toB[op.bIndex]!, runs, 'to');
    }
  }
  return { from: fromDoc.body.innerHTML, to: toDoc.body.innerHTML };
}
