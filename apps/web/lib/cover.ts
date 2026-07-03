// Deterministic halftone-dot cover placeholder — used wherever a cover image may be missing
// (DR-2 CatalogCard, DR-3 WorkHero/ChapterList rows). Never a broken <img>; extracted from
// CatalogCard's original inline coverStyle() so both callers share one formula (ponytail reuse).
import type { CSSProperties } from 'react';

export function coverStyle(id: string, cover: string | null): CSSProperties {
  if (cover) return { backgroundImage: `url(${cover})`, backgroundSize: 'cover' };
  const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dark = hash % 3 === 2;
  const angle = [125, 215, 60, 150, 40, 75][hash % 6];
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.5px,transparent 1.6px), linear-gradient(${angle}deg, ${dark ? 'var(--accent) 40%,var(--ink) 40%' : 'var(--ink) 42%,var(--accent) 42%'})`,
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}
