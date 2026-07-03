'use client';

// DR-4 FE-2 — reader topbar. Replica of LECTEUR lines 748-765. No webtoon mode (F10): the
// read-mode control renders a single active "Pages" segment, the prototype's "Webtoon" segment
// is dropped entirely (story explicitly removes it).
import { useState } from 'react';
import Link from 'next/link';
import type { FavoriteWorkDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { CaretDownIcon, StudioIcon, FullscreenIcon } from '../icons';

type Props = {
  workTitle: string;
  workSlug: string;
  currentChapterNumber: number;
  favorites: FavoriteWorkDto[];
  signedIn: boolean;
  readMode: 'pages' | 'prose';
  spreadMode: 'single' | 'double';
  onSpreadChange: (mode: 'single' | 'double') => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
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
  readMode,
  spreadMode,
  onSpreadChange,
  isFullscreen,
  onFullscreenToggle,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#f1ece1', flexWrap: 'wrap' }}>
      <Link href="/decouvrir" style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: 0.85, textDecoration: 'none', color: 'inherit' }}>
        ‹ Catalogue
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
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              zIndex: 50,
              width: 240,
              background: '#221d18',
              border: '3px solid #4a4239',
              borderRadius: 8,
              boxShadow: '5px 5px 0 rgba(0,0,0,.5)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#8d8478', borderBottom: '2px solid #4a4239' }}>
              ★ MES FAVORIS
            </div>
            {!signedIn && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#cabfb2' }}>
                <Link href="/connexion" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  Se connecter
                </Link>{' '}
                pour voir vos favoris.
              </div>
            )}
            {signedIn && favorites.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#cabfb2' }}>Aucun favori pour l&apos;instant.</div>
            )}
            {signedIn &&
              favorites.map((fav) => (
                <Link
                  key={fav.slug}
                  href={`/lecteur/${fav.slug}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: '1.5px solid #2c261f', textDecoration: 'none' }}
                >
                  <span aria-hidden="true" style={{ width: 26, height: 34, border: '2px solid #4a4239', borderRadius: 3, flex: 'none', ...coverStyle(fav.slug, fav.cover) }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fav.title}</div>
                    <div style={{ fontSize: 11, color: '#cabfb2' }}>{fav.meta}</div>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }} className="ep-reader-topbar-actions">
        <div style={{ display: 'flex', border: '2px solid #4a4239', borderRadius: 6, overflow: 'hidden' }}>
          <span style={segmentBtn(true)}>Pages</span>
        </div>
        <div style={{ display: 'flex', border: '2px solid #4a4239', borderRadius: 6, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => onSpreadChange('single')}
            disabled={readMode === 'prose'}
            aria-pressed={spreadMode === 'single'}
            style={{ ...segmentBtn(spreadMode === 'single'), opacity: readMode === 'prose' ? 0.4 : 1, cursor: readMode === 'prose' ? 'not-allowed' : 'pointer' }}
          >
            1 page
          </button>
          <button
            type="button"
            onClick={() => onSpreadChange('double')}
            disabled={readMode === 'prose'}
            aria-pressed={spreadMode === 'double'}
            style={{ ...segmentBtn(spreadMode === 'double'), opacity: readMode === 'prose' ? 0.4 : 1, cursor: readMode === 'prose' ? 'not-allowed' : 'pointer' }}
          >
            2 pages
          </button>
        </div>
        <button type="button" title="Bientôt disponible" onClick={(e) => e.preventDefault()} style={toolBtn}>
          <StudioIcon size={14} /> Studio
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
