'use client';

// DR-4 FE-4 — center stage: manga page panels (single/2-page spread) or paginated prose.
// Replica of LECTEUR lines 780-816. F7 (loading placeholder) / F9 (error+retry) states live here.
import { PROSE_PARAGRAPHS_PER_PAGE, type ChapterPagesResponse, type ReaderPageDto } from '@encre-et-plume/shared';

export type PagesState = 'loading' | 'ready' | 'locked' | 'error';

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

const pageCardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  boxShadow: '8px 8px 0 rgba(0,0,0,.5)',
  padding: 12,
};

function halftoneStyle(seed: number): React.CSSProperties {
  const dark = seed % 3 === 2;
  return {
    width: 260,
    height: 340,
    border: '2px solid var(--ink)',
    backgroundColor: dark ? 'var(--ink)' : 'var(--card)',
    backgroundImage: `radial-gradient(${dark ? 'rgba(255,255,255,.18)' : 'var(--ink)'} 1.5px,transparent 1.6px)`,
    backgroundSize: 'var(--dot) var(--dot)',
  };
}

function PageCard({ workTitle, chapterNumber, page }: { workTitle: string; chapterNumber: number; page: ReaderPageDto }) {
  const alt = `${workTitle} — chapitre ${chapterNumber}, page ${page.index}`;
  return (
    <div style={{ ...pageCardStyle, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      {page.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- plain <img> + CDN semantics (no next/image), platform convention
        <img src={page.image} alt={alt} style={{ display: 'block', maxWidth: '100%' }} />
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
    <div key={`${chapterNumber}-${page}`} className="ep-reader-page-enter" style={{ display: 'flex', gap: 0, justifyContent: 'center', flexWrap: 'wrap' }}>
      <PageCard workTitle={workTitle} chapterNumber={chapterNumber} page={current} />
      {second && <PageCard workTitle={workTitle} chapterNumber={chapterNumber} page={second} />}
    </div>
  );
}

function RomanPages({ chapterNumber, chapterTitle, prose, page }: { chapterNumber: number; chapterTitle: string | null; prose: string[]; page: number }) {
  const start = (page - 1) * PROSE_PARAGRAPHS_PER_PAGE;
  const paragraphs = prose.slice(start, start + PROSE_PARAGRAPHS_PER_PAGE);
  return (
    <div
      key={`${chapterNumber}-${page}`}
      className="ep-reader-page-enter"
      style={{ background: '#fffefb', border: '3px solid var(--ink)', boxShadow: '8px 8px 0 rgba(0,0,0,.5)', padding: '24px 30px', color: '#16130f', maxWidth: 560, width: '100%' }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.14em', color: '#6f655a', textTransform: 'uppercase' }}>
        Chapitre {chapterNumber}
      </div>
      {chapterTitle && (
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, textTransform: 'uppercase', margin: '3px 0 18px', lineHeight: 1 }}>
          {chapterTitle}
        </div>
      )}
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 13px' }}>
          {p}
        </p>
      ))}
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

  if (pagesState === 'locked' || !pagesData) {
    // Content stays hidden; the parent renders the Paywall overlay on top of this placeholder.
    return <div aria-hidden="true" style={{ width: 260, height: 340 }} />;
  }

  if (pagesData.readMode === 'prose') {
    return <RomanPages chapterNumber={chapterNumber} chapterTitle={chapterTitle} prose={pagesData.prose} page={page} />;
  }

  return <MangaPages workTitle={workTitle} chapterNumber={chapterNumber} pages={pagesData.pages} page={page} spreadMode={spreadMode} />;
}
