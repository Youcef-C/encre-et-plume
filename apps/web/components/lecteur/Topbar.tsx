'use client';

// DR-4 FE-2 — reader topbar. Replica of LECTEUR lines 748-765. No webtoon mode (F10): the
// read-mode control renders a single active "Pages" segment, the prototype's "Webtoon" segment
// is dropped entirely (story explicitly removes it).
import { useState } from 'react';
import Link from 'next/link';
import type { FavoriteWorkDto } from '@encre-et-plume/shared';
import { CaretDownIcon, StudioIcon, FullscreenIcon } from '../icons';
import FavoritesMenu from './FavoritesMenu';

type Props = {
  workTitle: string;
  workSlug: string;
  currentChapterNumber: number;
  favorites: FavoriteWorkDto[];
  signedIn: boolean;
  spreadMode: 'single' | 'double';
  onSpreadChange: (mode: 'single' | 'double') => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  clearViewActive: boolean;
  onToggleClearView: () => void;
};

const segmentBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  cursor: 'pointer',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#fff' : '#cabfb2',
  border: 'none',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
});

const toolBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: '#cabfb2',
  background: '#221d18',
  border: '2px solid #4a4239',
  borderRadius: 6,
  padding: '6px 13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function Topbar({
  workTitle,
  workSlug,
  currentChapterNumber,
  favorites,
  signedIn,
  spreadMode,
  onSpreadChange,
  isFullscreen,
  onFullscreenToggle,
  clearViewActive,
  onToggleClearView,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#f1ece1', flexWrap: 'wrap' }}>
      {/* Story update (2026-07-04): back returns to the current work, not the catalogue - overrides
          the prototype's "‹ Catalogue" link. "✕ Quitter" (tool row, right) already resolves to the
          same /oeuvre/{slug} destination as an explicit "quit reading" action; this is the one
          breadcrumb-style "go back" affordance, so the two aren't two competing "back" buttons. */}
      <Link href={`/oeuvre/${workSlug}`} style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: 0.85, textDecoration: 'none', color: 'inherit' }}>
        ‹ Retour à l&apos;œuvre
      </Link>

      <span style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            textTransform: 'uppercase',
            background: 'none',
            border: 'none',
            color: '#fff',
          }}
        >
          {workTitle} · Ch. {currentChapterNumber} <CaretDownIcon size={13} style={{ color: '#cabfb2' }} />
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 50 }}>
            <FavoritesMenu favorites={favorites} signedIn={signedIn} />
          </div>
        )}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }} className="ep-reader-topbar-actions">
        <div style={{ display: 'flex', border: '2px solid #4a4239', borderRadius: 6, overflow: 'hidden' }}>
          <span style={segmentBtn(true)}>Pages</span>
        </div>
        <div style={{ display: 'flex', border: '2px solid #4a4239', borderRadius: 6, overflow: 'hidden' }}>
          {/* Story update (States bullet): the 2-page spread is now enabled for roman too (was
              disabled/locked for prose) - two A4 page surfaces side by side (Stage.tsx), same as
              the manga 2-page spread; narrow viewports still fall back to single automatically
              (Reader.tsx's existing forceSingleSpread media-query check, unaffected by readMode). */}
          <button type="button" onClick={() => onSpreadChange('single')} aria-pressed={spreadMode === 'single'} style={segmentBtn(spreadMode === 'single')}>
            1 page
          </button>
          <button type="button" onClick={() => onSpreadChange('double')} aria-pressed={spreadMode === 'double'} style={segmentBtn(spreadMode === 'double')}>
            2 pages
          </button>
        </div>
        {/* Story update: "◳ Studio" repurposed into a "clear view" toggle - collapses both side
            asides (Chapitres + Réactions) for a bigger, distraction-free reading panel, distinct
            from full immersive fullscreen (the topbar itself stays visible either way). */}
        <button
          type="button"
          onClick={onToggleClearView}
          aria-pressed={clearViewActive}
          title={clearViewActive ? 'Rétablir les panneaux' : 'Réduire les panneaux pour lire sans distraction'}
          style={{
            ...toolBtn,
            background: clearViewActive ? 'var(--accent)' : toolBtn.background,
            color: clearViewActive ? '#fff' : toolBtn.color,
            borderColor: clearViewActive ? 'var(--ink)' : '#4a4239',
          }}
        >
          <StudioIcon size={14} /> Vue dégagée
        </button>
        <button
          type="button"
          onClick={onFullscreenToggle}
          aria-label={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
          style={{ ...toolBtn, color: '#fff', background: 'var(--accent)', border: '2px solid var(--ink)' }}
        >
          <FullscreenIcon size={14} /> {isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        </button>
        {/* QA F1 fix (round 2): "✕ Quitter" lives IN this flex row (rightmost, next to "Plein
            écran") instead of position:fixed/absolute over the stage. A normal flex child in a
            flex-wrap row can never overlap its siblings or the persistent site header above it
            — the previous coordinate-based fix (position:absolute) only moved the collision
            around (it landed on "Plein écran" at 1280px, on the chapter dropdown at 375px).
            This is structural, not positional: overlap is impossible by construction. */}
        <Link
          href={`/oeuvre/${workSlug}`}
          style={{ ...toolBtn, color: '#fff', background: 'var(--accent)', border: '2px solid #fff', textDecoration: 'none' }}
        >
          ✕ Quitter
        </Link>
      </div>
    </div>
  );
}
