// DR-3 — Work page "Œuvre" formatters + French labels. Types come from @encre-et-plume/shared;
// French copy lives here per lib/home.ts / lib/catalog.ts convention. Reuse formatLikeCount from
// lib/home for like/read/favorite counters — not reimplemented here.

/** 4.66 -> "4,7"; 4 -> "4" (French comma, one decimal, drop trailing ",0"). */
export function ratingLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/** "2024-03-14T00:00:00.000Z" -> "14 mars 2024" (fr-FR, UTC to match server-stored dates). */
export function chapterDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** ISO date -> year only, e.g. "2024". '' when null (unknown release date — DÉTAILS "Sortie"). */
export function releaseYearLabel(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('fr-FR', { year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

/** Cents -> whole-euro French label, e.g. 45000 -> "450" (funding goal current/target). */
export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}
