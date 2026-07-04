'use client';

// DR-4 FE-4 — center stage: manga page panels (single/2-page spread) or paginated prose.
// Replica of LECTEUR lines 780-816. F7 (loading placeholder) / F9 (error+retry) states live here.
import { PROSE_PARAGRAPHS_PER_PAGE, type ChapterPagesResponse, type ReaderPageDto } from '@encre-et-plume/shared';

export type PagesState = 'loading' | 'ready' | 'locked' | 'error' | 'age-restricted';

type Props = {
  workTitle: string;
  chapterNumber: number;
  chapterTitle: string | null;
  pagesState: PagesState;
  pagesData: ChapterPagesResponse | null;
  page: number;
  spreadMode: 'single' | 'double';
  onRetry: () => void;
};

// Story update (2026-07-04): manga pages are forced to a fixed manga page ratio (~2:3 portrait);
// roman prose pages to A4 (1:√2). Both use the same CSS technique - `aspect-ratio` with `width`/
// `height` left `auto` and only `max-width`/`max-height` constraining - the standard "shrink to
// fit both available dimensions while preserving the ratio" algorithm (the non-replaced-element
// equivalent of `object-fit: contain`), so the page scales down to fit the stage but never
// stretches or gets cropped, in both normal and fullscreen modes and at every breakpoint.
export const MANGA_PAGE_RATIO = '2 / 3';
export const ROMAN_PAGE_RATIO = '1 / 1.414';

// QA BLOCKER round 2: giving the WRAPPER a definite width/height (below) was necessary but not
// sufficient - a flex item with only `maxWidth`/`maxHeight` (caps, not values) and no `width`/
// `height` of its own still falls back to content-based (min-content) sizing, regardless of how
// large its parent is; `alignItems:'center'` doesn't stretch it into the parent's height either.
// Fix mirrors `RomanPageSurface` verbatim (that one already works this way): give the page card an
// explicit, definite `height:'100%'` (resolves against the wrapper's own definite height) and let
// `width` derive from `aspect-ratio` (`auto`), with `maxWidth:'100%'` so it shrinks instead of
// overflowing when two pages don't both fit at native width (2-page spread, narrow viewports).
// Sizing against the now viewport-anchored definite-height stage. The page's content is a
// flex:1 image with no intrinsic size, so it needs ONE definite dimension for aspect-ratio to
// resolve (auto+auto collapses to min-content). SINGLE: height:100% is the definite driver
// (width derives from 2:3), rendering large on the definite-height stage. DOUBLE: flex:1 1 0 +
// maxWidth:calc(50%-6px) makes width the definite driver so two pages sit side by side (height
// derives from 2:3, capped by maxHeight) instead of wrapping/stacking — mirrors RomanPageSurface.
function pageCardStyle(double?: boolean): React.CSSProperties {
  return double
    ? {
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        boxShadow: '8px 8px 0 rgba(0,0,0,.5)',
        padding: 12,
        aspectRatio: MANGA_PAGE_RATIO,
        flex: '1 1 0',
        width: 'auto',
        maxWidth: 'calc(50% - 6px)',
        height: 'auto',
        maxHeight: '100%',
        minHeight: 0,
      }
    : {
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        boxShadow: '8px 8px 0 rgba(0,0,0,.5)',
        padding: 12,
        aspectRatio: MANGA_PAGE_RATIO,
        height: '100%',
        width: 'auto',
        maxWidth: '100%',
      };
}

function halftoneStyle(seed: number): React.CSSProperties {
  const dark = seed % 3 === 2;
  return {
    width: '100%',
    // flex:1 (not height:100%) so this still shares the column with an optional caption sibling
    // below it instead of claiming the card's full height and overflowing past the caption.
    flex: '1 1 0',
    minHeight: 0,
    border: '2px solid var(--ink)',
    backgroundColor: dark ? 'var(--ink)' : 'var(--card)',
    backgroundImage: `radial-gradient(${dark ? 'rgba(255,255,255,.18)' : 'var(--ink)'} 1.5px,transparent 1.6px)`,
    backgroundSize: 'var(--dot) var(--dot)',
  };
}

function PageCard({ workTitle, chapterNumber, page, double }: { workTitle: string; chapterNumber: number; page: ReaderPageDto; double?: boolean }) {
  const alt = `${workTitle} — chapitre ${chapterNumber}, page ${page.index}`;
  return (
    <div className="ep-manga-page" style={{ ...pageCardStyle(double), display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      {page.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- plain <img> + CDN semantics (no next/image), platform convention
        <img
          src={page.image}
          alt={alt}
          // object-fit:contain is still needed even though the card itself is now ratio-locked -
          // a real scanned manga page's native ratio won't always be exactly 2:3, so this is what
          // keeps IT from stretching/cropping to fill the (slightly different) card shape.
          // flex:1 (not height:100%) shares the column with an optional caption sibling below it.
          style={{ display: 'block', width: '100%', flex: '1 1 0', minHeight: 0, objectFit: 'contain' }}
        />
      ) : (
        <div role="img" aria-label={alt} style={halftoneStyle(page.index)} />
      )}
      {page.caption && (
        <span
          style={{
            alignSelf: 'flex-start',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 16,
            padding: '6px 14px',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {page.caption}
        </span>
      )}
    </div>
  );
}

function MangaPages({ workTitle, chapterNumber, pages, page, spreadMode }: { workTitle: string; chapterNumber: number; pages: ReaderPageDto[]; page: number; spreadMode: 'single' | 'double' }) {
  const current = pages[page - 1];
  if (!current) return null;
  const showSecond = spreadMode === 'double' && !current.double && page < pages.length;
  const second = showSecond ? pages[page] : null;
  return (
    <div
      key={`${chapterNumber}-${page}`}
      className="ep-reader-page-enter"
      // width:100%/height:100% give this wrapper the stage's definite box; each PageCard then
      // contain-sizes within it (single) or width-caps to half the row (double, side by side).
      // flexWrap only kicks in on genuinely narrow widths where two half-pages can't fit.
      style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', width: '100%', height: '100%' }}
    >
      <PageCard workTitle={workTitle} chapterNumber={chapterNumber} page={current} double={!!second} />
      {second && <PageCard workTitle={workTitle} chapterNumber={chapterNumber} page={second} double />}
    </div>
  );
}

function RomanPageSurface({ chapterNumber, chapterTitle, paragraphs, showKicker, double }: { chapterNumber: number; chapterTitle: string | null; paragraphs: string[]; showKicker: boolean; double?: boolean }) {
  return (
    <div
      style={{
        background: '#fffefb',
        border: '3px solid var(--ink)',
        boxShadow: '8px 8px 0 rgba(0,0,0,.5)',
        padding: '24px 30px',
        color: '#16130f',
        aspectRatio: ROMAN_PAGE_RATIO,
        // A4 surface is WIDTH-driven so two fit side by side in double mode: flex-basis caps the
        // width (single: 560; double: ~half the row), height derives from aspect-ratio, and
        // maxHeight:100% keeps it inside the (now viewport-anchored) definite-height stage.
        // minHeight:0 + overflowY:auto keep the ratio even when the prose is longer than one page.
        flex: double ? '1 1 0' : '0 1 auto',
        width: double ? 'auto' : '100%',
        maxWidth: double ? 'calc(50% - 9px)' : 560,
        height: 'auto',
        maxHeight: '100%',
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      {showKicker && (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.14em', color: '#6f655a', textTransform: 'uppercase' }}>
            Chapitre {chapterNumber}
          </div>
          {chapterTitle && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, textTransform: 'uppercase', margin: '3px 0 18px', lineHeight: 1 }}>
              {chapterTitle}
            </div>
          )}
        </>
      )}
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 13px' }}>
          {p}
        </p>
      ))}
    </div>
  );
}

function RomanPages({
  chapterNumber,
  chapterTitle,
  prose,
  page,
  spreadMode,
}: {
  chapterNumber: number;
  chapterTitle: string | null;
  prose: string[];
  page: number;
  spreadMode: 'single' | 'double';
}) {
  const start = (page - 1) * PROSE_PARAGRAPHS_PER_PAGE;
  const paragraphs = prose.slice(start, start + PROSE_PARAGRAPHS_PER_PAGE);
  // NEW: roman 2-page spread (story States update) - two A4 surfaces side by side, same
  // pagination step as manga's double mode (Reader.tsx pages by 2 when spreadMode is 'double').
  const secondStart = start + PROSE_PARAGRAPHS_PER_PAGE;
  const showSecond = spreadMode === 'double' && secondStart < prose.length;
  const secondParagraphs = showSecond ? prose.slice(secondStart, secondStart + PROSE_PARAGRAPHS_PER_PAGE) : [];

  return (
    <div
      key={`${chapterNumber}-${page}`}
      className="ep-reader-page-enter"
      style={{ display: 'flex', gap: 18, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', width: '100%', height: '100%' }}
    >
      <RomanPageSurface chapterNumber={chapterNumber} chapterTitle={chapterTitle} paragraphs={paragraphs} showKicker double={showSecond} />
      {showSecond && (
        <RomanPageSurface chapterNumber={chapterNumber} chapterTitle={chapterTitle} paragraphs={secondParagraphs} showKicker={false} double />
      )}
    </div>
  );
}

export default function Stage({ workTitle, chapterNumber, chapterTitle, pagesState, pagesData, page, spreadMode, onRetry }: Props) {
  if (pagesState === 'loading') {
    return (
      <div
        role="status"
        aria-label="Chargement des pages…"
        className="ep-skeleton-delayed"
        style={{ width: 260, height: 340, background: '#2c261f', border: '2px solid #4a4239' }}
      />
    );
  }

  if (pagesState === 'error') {
    return (
      <div role="alert" style={{ textAlign: 'center', color: '#f1ece1', padding: 40 }}>
        <p style={{ marginBottom: 12, fontWeight: 700 }}>Impossible de charger cette page.</p>
        <button
          type="button"
          onClick={onRetry}
          style={{ fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: '2px solid #fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (pagesState === 'locked' || pagesState === 'age-restricted' || !pagesData) {
    // Content stays hidden; the parent renders the Paywall/AgeGate refusal overlay on top of
    // this placeholder.
    return <div aria-hidden="true" style={{ width: 260, height: 340 }} />;
  }

  if (pagesData.readMode === 'prose') {
    return <RomanPages chapterNumber={chapterNumber} chapterTitle={chapterTitle} prose={pagesData.prose} page={page} spreadMode={spreadMode} />;
  }

  return <MangaPages workTitle={workTitle} chapterNumber={chapterNumber} pages={pagesData.pages} page={page} spreadMode={spreadMode} />;
}
