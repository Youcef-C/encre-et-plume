// DR-1 — Accueil formatters + French labels. Types come from @encre-et-plume/shared;
// French copy lives here per existing convention (see lib/api.ts note in backend-notes.md).
import type { AnnouncementType } from '@encre-et-plume/shared';

export const ANNOUNCEMENT_LABEL: Record<AnnouncementType, string> = {
  concours: 'Concours',
  a_chaud: 'À chaud',
  evenement: 'Événement',
};

/** 8100 → "8,1k", 4000 → "4k", 570 → "570" (French comma, one decimal, drop ",0"). */
export function formatLikeCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  const str = k % 1 === 0 ? String(k) : k.toFixed(1).replace('.', ',');
  return `${str}k`;
}

/** 24 → "↑ 24%", -5 → "↓ 5%". */
export function growthLabel(pct: number): string {
  return `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`;
}

/** Ceil days until releaseAt → "dans N j" (clamped at 0). */
export function countdownLabel(releaseAt: string, now: Date = new Date()): string {
  const days = Math.ceil((new Date(releaseAt).getTime() - now.getTime()) / 86_400_000);
  return `dans ${Math.max(days, 0)} j`;
}

/** "2026-06-19T18:00:00.000Z" → "VEN. 19 JUIN · 18:00" (UTC, uppercase, French). */
export function releaseDateLabel(releaseAt: string): string {
  const d = new Date(releaseAt);
  const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(d);
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone: 'UTC' }).format(d);
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hourCycle: 'h23',
  }).format(d);
  return `${weekday.toUpperCase()} ${day} ${month.toUpperCase()} · ${time}`;
}
