// Deterministic halftone-dot cover placeholder — used wherever a cover image may be missing
// (DR-2 CatalogCard, DR-3 WorkHero/ChapterList rows). Never a broken <img>; extracted from
// CatalogCard's original inline coverStyle() so both callers share one formula (ponytail reuse).
import type { CSSProperties } from 'react';

// DR-12 FE-10 — one shared portrait cover-frame size so the preview box and the "Déposez la
// couverture" upload box read as ONE aligned pair (same height, same top). Both the collection
// manage view and the create form derive their heights from these values (never a mismatched
// hardcode).
export const COVER_FRAME_WIDTH = 120;
export const COVER_FRAME_HEIGHT = 165;

// `fit` controls the real-image branch only: 'cover' fills the frame (default, for cards/heroes),
// 'contain' shows the WHOLE image letterboxed (DR-6 fullscreen — never a zoomed crop). Either way the
// image is centered (was top-left), so a cover preview reads from its centre, not its corner.
export function coverStyle(id: string, cover: string | null, fit: 'cover' | 'contain' = 'cover'): CSSProperties {
  if (cover) return { backgroundImage: `url(${cover})`, backgroundSize: fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dark = hash % 3 === 2;
  const angle = [125, 215, 60, 150, 40, 75][hash % 6];
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.5px,transparent 1.6px), linear-gradient(${angle}deg, ${dark ? 'var(--accent) 40%,var(--ink) 40%' : 'var(--ink) 42%,var(--accent) 42%'})`,
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}
