'use client';

// DR-4 — "Plein écran" immersive mode's minimal bottom control bar (story update, 2026-07-04).
// Overlaid on the stage while the topbar + both asides are unmounted: page counter + prev/next
// + slider (reuses ReaderNav as-is), a compact "★ MES FAVORIS" quick-switch (reuses the same
// FavoritesMenu as the topbar dropdown), a compact chapter switch (reuses ChapterAside's
// ChapterRows — same lock/paywall semantics), and the control to exit the mode.
//
// Auto-hide (story update, 2026-07-04): after ~2.8s with no pointer move / key press / touch,
// the bar fades out (instantly under prefers-reduced-motion — see .ep-immersive-bar in
// globals.css) so the manga fills the screen uninterrupted. `data-hidden` is the single source
// of truth the CSS reads; hover-while-hidden is a pure-CSS override (`:hover` in globals.css, no
// JS needed) but keyboard focus is tracked in React state so a focused control is NEVER masked
// mid-Tab — `shown` is true whenever either is true.
import { useEffect, useRef, useState } from 'react';
import type { FavoriteWorkDto, WorkChapterDto } from '@encre-et-plume/shared';
import { StarIcon, CaretDownIcon, XIcon } from '../icons';
import FavoritesMenu from './FavoritesMenu';
import { ChapterRows } from './ChapterAside';
import ReaderNav from './ReaderNav';
import type { ReadingDirection } from './readingDirection';

const HIDE_DELAY_MS = 2800;

type Props = {
  page: number;
  totalPages: number;
  step: number;
  direction: ReadingDirection;
  onPrev: () => void;
  onNext: () => void;
  onSetPage: (page: number) => void;
  favorites: FavoriteWorkDto[];
  signedIn: boolean;
  chapters: WorkChapterDto[];
  currentChapterNumber: number;
  onLoadChapter: (chapter: WorkChapterDto) => void;
  onOpenPaywall: (chapter: WorkChapterDto) => void;
  onExitFullscreen: () => void;
};

const switchBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: '#fff',
  background: '#2c261f',
  border: '2px solid #4a4239',
  borderRadius: 6,
  padding: '10px 12px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function ImmersiveBar({
  page,
  totalPages,
  step,
  direction,
  onPrev,
  onNext,
  onSetPage,
  favorites,
  signedIn,
  chapters,
  currentChapterNumber,
  onLoadChapter,
  onOpenPaywall,
  onExitFullscreen,
}: Props) {
  const [favOpen, setFavOpen] = useState(false);
  const [chapOpen, setChapOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [focusWithin, setFocusWithin] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function reveal() {
      setVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }
    reveal(); // start the idle timer as soon as the immersive mode mounts
    document.addEventListener('pointermove', reveal);
    document.addEventListener('keydown', reveal);
    document.addEventListener('touchstart', reveal);
    return () => {
      clearTimeout(hideTimer.current);
      document.removeEventListener('pointermove', reveal);
      document.removeEventListener('keydown', reveal);
      document.removeEventListener('touchstart', reveal);
    };
  }, []);

  const shown = visible || focusWithin;

  return (
    <div
      role="toolbar"
      aria-label="Contrôles du mode plein écran"
      className="ep-reader-page-enter ep-immersive-bar"
      data-hidden={shown ? 'false' : 'true'}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
      style={{
        // QA (round 2): overlay the stage's bottom edge instead of a flex row that reserves its
        // own layout height — that reservation is exactly what kept the stage at ~91%/~77% of
        // the viewport and stopped it growing back when the bar auto-hid. `data-hidden` still
        // drives visibility (globals.css); this element occupies zero layout space either way.
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'rgba(34,29,24,.94)',
        borderTop: '2px solid #4a4239',
        // Soft scrim blending the opaque bar into the manga art above it (the "bottom gradient
        // scrim" manga readers commonly use for legibility), cheaper than a second gradient layer.
        boxShadow: '0 -28px 36px -20px rgba(0,0,0,.55)',
        color: '#f1ece1',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ position: 'relative' }}>
        <button type="button" onClick={() => setFavOpen((v) => !v)} aria-expanded={favOpen} style={switchBtn}>
          <StarIcon size={13} /> Favoris <CaretDownIcon size={11} />
        </button>
        {favOpen && (
          <div style={{ position: 'absolute', bottom: 48, left: 0, zIndex: 60 }}>
            <FavoritesMenu favorites={favorites} signedIn={signedIn} />
          </div>
        )}
      </span>

      <span style={{ position: 'relative' }}>
        <button type="button" onClick={() => setChapOpen((v) => !v)} aria-expanded={chapOpen} style={switchBtn}>
          Ch. {currentChapterNumber} <CaretDownIcon size={11} />
        </button>
        {chapOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 48,
              left: 0,
              zIndex: 60,
              width: 184,
              maxHeight: 240,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              background: '#221d18',
              border: '3px solid #4a4239',
              borderRadius: 8,
              boxShadow: '5px 5px 0 rgba(0,0,0,.5)',
              padding: 8,
            }}
          >
            <ChapterRows
              chapters={chapters}
              currentChapterNumber={currentChapterNumber}
              onLoadChapter={(chapter) => {
                setChapOpen(false);
                onLoadChapter(chapter);
              }}
              onOpenPaywall={(chapter) => {
                setChapOpen(false);
                onOpenPaywall(chapter);
              }}
            />
          </div>
        )}
      </span>

      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
        <ReaderNav direction={direction} page={page} totalPages={totalPages} step={step} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />
      </div>

      <button
        type="button"
        onClick={onExitFullscreen}
        aria-label="Quitter le plein écran"
        style={{ ...switchBtn, background: 'var(--accent)', border: '2px solid #fff' }}
      >
        <XIcon size={13} /> Quitter le plein écran
      </button>
    </div>
  );
}
