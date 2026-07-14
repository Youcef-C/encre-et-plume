// CS-4 item 24 — TRUE content-reflow paginator (view-only). Long case content flows onto successive
// A4 sheets with a real gap between them: an overflowing block is pushed to the top of the next page
// instead of text running across the boundary. This is a pure VIEW concern — it NEVER mutates the
// ProseMirror doc or the Yjs CRDT: page breaks are widget-decoration spacers + presentation frame
// DOM, so the caret's document position is untouched (it just moves down with its block on reflow)
// and pagination adds no history/CRDT ops.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

export interface PageGeometry {
  /** Full A4 page height (border-box) in px. */
  pageH: number;
  /** Visible studio-tone gutter between two stacked sheets, in px. */
  gap: number;
  /** Vertical inner page padding (top and bottom inset), in px. */
  padY: number;
}

export interface BlockMetrics {
  /** Document position immediately before the block (the spacer widget's anchor). */
  pos: number;
  /** Natural (spacer-free) top of the block relative to the content box, in px. */
  top: number;
  /** Border-box height of the block, in px. */
  height: number;
}

export interface Spacer {
  pos: number;
  height: number;
}

export interface Pagination {
  spacers: Spacer[];
  pageCount: number;
}

const EPS = 0.5; // sub-pixel tolerance so rounding never triggers a phantom break

/**
 * Fit `blocks` (in top-to-bottom order) into A4 pages: a block whose bottom would cross the current
 * page's content boundary is pushed down to the next page's content top, and the required push
 * (which spans the page tail + the inter-sheet gap + the next page's top padding) is returned as a
 * spacer. Pure + deterministic (no DOM), so it converges in one pass and is unit-testable.
 *
 * ponytail: breaks happen at BLOCK boundaries only. A single block taller than one usable page
 * (e.g. a giant pasted paragraph with no internal break point) can't be split and is left to span
 * pages; `pageCount` still grows to draw frames under it. Splitting inside a block would need a
 * line-level layout engine — out of scope.
 */
export function paginateBlocks(blocks: BlockMetrics[], geo: PageGeometry): Pagination {
  const { pageH, gap, padY } = geo;
  const slot = pageH + gap; // one page + its trailing gutter
  const usable = pageH - 2 * padY; // max content height that fits on a page
  const pageTop = (k: number) => k * slot + padY; // usable content top of page k
  const usableBottom = (k: number) => k * slot + pageH - padY; // content must stop here on page k

  const spacers: Spacer[] = [];
  let page = 0;
  let accum = 0; // total spacer height inserted above the current block

  for (const b of blocks) {
    const et = b.top + accum; // effective top after pushes above
    const eb = et + b.height;
    const overflows = eb > usableBottom(page) + EPS;
    const fitsAPage = b.height <= usable + EPS;
    const notAtPageTop = et > pageTop(page) + EPS; // don't push a block that already starts the page
    if (overflows && fitsAPage && notAtPageTop) {
      const newTop = pageTop(page + 1);
      const add = newTop - et;
      if (add > 0) {
        spacers.push({ pos: b.pos, height: Math.round(add) });
        accum += add;
      }
      page += 1;
    } else {
      // A block already flowed onto a later page (e.g. a too-tall block spilled over) — keep the
      // page counter honest so we draw enough frames beneath it.
      while (et >= pageTop(page + 1) - EPS) page += 1;
    }
  }

  const last = blocks[blocks.length - 1];
  const lastBottom = last ? last.top + accum + last.height : 0;
  const pageCount = Math.max(1, page + 1, Math.ceil((lastBottom - EPS) / slot));
  return { spacers, pageCount };
}

// ── ProseMirror glue: measure each A4 case sheet and apply the reflow ─────────────────────────────

const A4_RATIO = 297 / 210; // portrait height ÷ width
const DEFAULT_GAP = 26; // fallback if the --ep-page-gap CSS token is unreadable

const paginationKey = new PluginKey<DecorationSet>('epPagination');

/** Build the widget-decoration set (block spacers) for the whole doc from a flat spacer list. */
function buildDecorations(doc: import('@tiptap/pm/model').Node, spacers: Spacer[]): DecorationSet {
  const size = doc.content.size;
  const widgets = spacers
    .filter((s) => s.pos >= 0 && s.pos <= size && s.height > 0)
    .map((s) =>
      Decoration.widget(
        s.pos,
        () => {
          const el = document.createElement('div');
          el.className = 'ep-page-spacer';
          el.style.height = `${s.height}px`;
          el.setAttribute('contenteditable', 'false');
          el.setAttribute('aria-hidden', 'true');
          return el;
        },
        { side: -1, key: `ep-sp-${s.pos}-${s.height}`, ignoreSelection: true },
      ),
    );
  return DecorationSet.create(doc, widgets);
}

/** Ensure a case sheet's frame layer holds exactly `count` A4 frames at the right offsets. */
function syncFrames(framesEl: HTMLElement, count: number, pageH: number, slot: number): void {
  while (framesEl.childElementCount > count) framesEl.lastElementChild!.remove();
  while (framesEl.childElementCount < count) {
    const f = document.createElement('div');
    f.className = 'ep-page-frame';
    framesEl.appendChild(f);
  }
  Array.from(framesEl.children).forEach((child, k) => {
    const f = child as HTMLElement;
    f.style.top = `${k * slot}px`;
    f.style.height = `${pageH}px`;
  });
}

function spacersEqual(a: Spacer[], b: Spacer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.pos === b[i].pos && s.height === b[i].height);
}

/** Measure every case sheet, compute spacers + frame counts, and return the aggregated spacer list. */
function measureAll(view: EditorView): Spacer[] {
  const all: Spacer[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'caseBlock') return;
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom || typeof dom.getBoundingClientRect !== 'function') return;
    const contentEl = dom.querySelector<HTMLElement>(':scope > .ep-case-content');
    const framesEl = dom.querySelector<HTMLElement>(':scope > .ep-page-frames');
    if (!contentEl || !framesEl) return;

    const width = dom.offsetWidth;
    if (width <= 0) return;
    const pageH = Math.round(width * A4_RATIO);
    const cs = getComputedStyle(contentEl);
    const padY = parseFloat(cs.paddingTop) || 0;
    const gap = parseFloat(getComputedStyle(dom).getPropertyValue('--ep-page-gap')) || DEFAULT_GAP;
    const slot = pageH + gap;
    dom.style.setProperty('--ep-page-h', `${pageH}px`); // min-height for a near-empty single page

    // Natural (spacer-free) coordinates: subtract the height of any spacer widgets physically above
    // a block. Purely geometric, so it's immune to doc-position drift between measures.
    const contentTop = contentEl.getBoundingClientRect().top;
    const spacerEls = Array.from(contentEl.querySelectorAll<HTMLElement>('.ep-page-spacer')).map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });

    const blocks: BlockMetrics[] = [];
    contentEl.querySelectorAll<HTMLElement>(':scope > .ep-case-description > *, :scope > .ep-case-dialogue > *').forEach((el) => {
      const r = el.getBoundingClientRect();
      const above = spacerEls.reduce((sum, s) => (s.top < r.top - EPS ? sum + s.height : sum), 0);
      let pos: number;
      try {
        pos = view.posAtDOM(el, 0) - 1;
      } catch {
        return;
      }
      blocks.push({ pos, top: r.top - contentTop - above, height: r.height });
    });

    const { spacers, pageCount } = paginateBlocks(blocks, { pageH, gap, padY });
    syncFrames(framesEl, pageCount, pageH, slot);
    all.push(...spacers);
  });
  return all;
}

/**
 * The pagination extension: a single ProseMirror plugin that measures every case sheet after each
 * DOM update (rAF-debounced), lays each A4 page-height of content onto its own bordered frame with a
 * real inter-sheet gap, and pushes overflowing blocks past the boundary via widget spacers. Applied
 * only by the planche editor (it's part of `plancheExtensions`), so the AD-8 article editor is
 * unaffected.
 */
export const PaginationExtension = Extension.create({
  name: 'epPagination',
  addProseMirrorPlugins() {
    let raf = 0;
    let applied: Spacer[] = [];

    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(paginationKey) as Spacer[] | undefined;
            if (next) return buildDecorations(tr.doc, next);
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state);
          },
        },
        view(view) {
          const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              if (view.isDestroyed) return;
              const spacers = measureAll(view);
              if (!spacersEqual(spacers, applied)) {
                applied = spacers;
                view.dispatch(view.state.tr.setMeta(paginationKey, spacers));
              }
            });
          };
          const onResize = () => schedule();
          window.addEventListener('resize', onResize);
          schedule();
          return {
            update: schedule,
            destroy() {
              window.removeEventListener('resize', onResize);
              if (raf) cancelAnimationFrame(raf);
            },
          };
        },
      }),
    ];
  },
});
