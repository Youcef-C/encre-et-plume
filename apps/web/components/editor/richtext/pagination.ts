// CS-4 item 24 — TRUE content-reflow paginator (view-only). The case is a real bordered A4 sheet
// (.ep-case-block) the content lives INSIDE and that grows with content; when content passes a page
// boundary an overflowing block is pushed past a page-break gap so text starts a new page instead of
// running across the boundary. This is a pure VIEW concern — it NEVER mutates the ProseMirror doc or
// the Yjs CRDT: page breaks are widget-decoration spacers (styled as a page-break rule), so the
// caret's document position is untouched (it just moves down with its block on reflow) and pagination
// adds no history/CRDT ops. There is no separate frame overlay, so content/caret are always ON the page.
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
  /** 1-based page number this break starts (2 for the first break in a case, 3 for the next, …).
   *  Assigned by `measureAll`; drives the "Page N" page-break indicator. */
  page?: number;
}

export interface Pagination {
  spacers: Spacer[];
  pageCount: number;
}

const EPS = 0.5; // sub-pixel tolerance so rounding never triggers a phantom break

/**
 * Fit `blocks` (in top-to-bottom order) into A4 pages: a block whose bottom would cross the current
 * page's content boundary is pushed down to the next page's content top, and the required push
 * (which spans the page tail + the page-break gap + the next page's top padding) is returned as a
 * spacer. Pure + deterministic (no DOM), so it converges in one pass and is unit-testable.
 *
 * ponytail: breaks happen at BLOCK boundaries only. A single block taller than one usable page
 * (e.g. a giant pasted paragraph with no internal break point) can't be split and is left to span
 * pages. Splitting inside a block would need a line-level layout engine — out of scope.
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

  // Every line counts, including blank ones: a page fills as the caret moves down it (with real text
  // OR blank lines), and when the next line would cross the page boundary it is pushed onto a new page
  // — so pressing Enter at the bottom of a filled page adds a page the caret follows to.
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
          // The "Page N" page-break indicator (drawn on the rule via CSS attr()).
          if (s.page) el.setAttribute('data-ep-page', String(s.page));
          return el;
        },
        { side: -1, key: `ep-sp-${s.pos}-${s.height}-${s.page ?? ''}`, ignoreSelection: true },
      ),
    );
  return DecorationSet.create(doc, widgets);
}

function spacersEqual(a: Spacer[], b: Spacer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.pos === b[i].pos && s.height === b[i].height && s.page === b[i].page);
}

/** Measure every case sheet and return the aggregated page-break spacer list. */
function measureAll(view: EditorView): Spacer[] {
  const all: Spacer[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.type.name !== 'caseBlock') return;
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom || typeof dom.getBoundingClientRect !== 'function') return;
    const contentEl = dom.querySelector<HTMLElement>(':scope > .ep-case-content');
    if (!contentEl) return;

    const width = dom.offsetWidth;
    if (width <= 0) return;
    const pageH = Math.round(width * A4_RATIO);
    const cs = getComputedStyle(contentEl);
    const padY = parseFloat(cs.paddingTop) || 0;
    const gap = parseFloat(getComputedStyle(dom).getPropertyValue('--ep-page-gap')) || DEFAULT_GAP;
    dom.style.setProperty('--ep-page-h', `${pageH}px`); // min-height so a short case still looks A4-tall

    // Measure blocks in a PRISTINE layout (spacers collapsed to 0), so a block's top is its true
    // spacer-free position. Measuring while the previous pass's spacers still occupy space is a
    // circular dependency that never converges (the reconstructed "natural" top drifts every pass,
    // so the computed spacers oscillate). Zeroing them (a class beats the inline height via
    // !important) and forcing one synchronous reflow via getBoundingClientRect breaks the loop; the
    // class is removed before the function returns, so the collapsed state is never painted.
    //
    // The class MUST go on `dom` (the case-block's outer NodeView element), NOT `contentEl` (the
    // ProseMirror contentDOM): a class mutation on the contentDOM is one the PM DOMObserver does NOT
    // ignore, which retriggers a redraw → another measure → a tight rebuild loop. A mutation on the
    // outer `dom` is discarded by the NodeView's ignoreMutation (see planche-schema.ts), so it's inert.
    dom.classList.add('ep-pag-measure');
    const contentTop = contentEl.getBoundingClientRect().top; // forces reflow with spacers at height 0
    const blocks: BlockMetrics[] = [];
    contentEl.querySelectorAll<HTMLElement>(':scope > .ep-case-description > *, :scope > .ep-case-dialogue > *').forEach((el) => {
      if (el.classList.contains('ep-page-spacer')) return; // our own decoration, not a content block
      const r = el.getBoundingClientRect();
      let pos: number;
      try {
        pos = view.posAtDOM(el, 0) - 1;
      } catch {
        return;
      }
      blocks.push({ pos, top: r.top - contentTop, height: r.height });
    });
    dom.classList.remove('ep-pag-measure');

    // The sheet grows to hold the spacer gap (the bordered .ep-case-block wraps everything), so only
    // the spacer list is needed — there is no separate frame layer to size. pageCount is unused here.
    // Number the breaks within this case: the i-th break starts page i+2 (page 1 is the top).
    const { spacers } = paginateBlocks(blocks, { pageH, gap, padY });
    spacers.forEach((s, i) => (s.page = i + 2));
    all.push(...spacers);
  });
  return all;
}

/**
 * The pagination extension: a single ProseMirror plugin that measures every case sheet after each
 * DOM update (rAF-debounced) and pushes an overflowing block past a page-break gap via a widget
 * spacer, so long text visibly starts a new page inside the growing bordered sheet instead of running
 * across the boundary. The editable content lives directly in the bordered .ep-case-block (no frame
 * overlay), so content and caret are always on the page. Applied only by the planche editor (part of
 * `plancheExtensions`), so the AD-8 article editor is unaffected.
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
                // The spacers just changed a block's on-screen position (e.g. Enter at a page bottom
                // pushed the caret's line onto a NEW page). The edit's own scroll-into-view already ran
                // with the PRE-spacer geometry, so the view didn't follow the caret onto the new page.
                // Re-fire scroll-into-view AFTER applying the spacers so the caret is kept within the
                // comfortable band at its real new position. Gate on focus: only follow when the user is
                // editing here, so a background/remote reflow never yanks a reader's scroll position.
                const tr = view.state.tr.setMeta(paginationKey, spacers);
                if (view.hasFocus()) tr.scrollIntoView();
                view.dispatch(tr);
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
