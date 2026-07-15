// CS-5 — small shared bits for the review surfaces (status colour + 1-based numbering).
import type { CorrectionDto, CorrectionStatus } from '@encre-et-plume/shared';

export const GREEN = '#1f8a5b'; // prototype "corrigé" green (validate button + resolved boxes/badges)
export const AMBER = '#b45309'; // "en cours" — burnt amber, distinct from à-corriger red; white-text AA

/** Status stepper order: à corriger → en cours → corrigé → (reopen) à corriger. Shared by the revision
 *  list AND the editor comment panel (r4: scenario corrections are stepped from the editor). */
export const NEXT_STATUS: Record<CorrectionStatus, CorrectionStatus> = {
  a_corriger: 'en_cours',
  en_cours: 'corrige',
  corrige: 'a_corriger',
};

/** Box / badge / anchor colour derived from status: accent red (à corriger), amber (en cours),
 *  green (corrigé). Single source shared by the image boxes AND the list cards. */
export function statusColor(status: CorrectionStatus): string {
  if (status === 'corrige') return GREEN;
  if (status === 'en_cours') return AMBER;
  return 'var(--accent)';
}

/**
 * D6 — 1-based numbering by createdAt across the whole page's corrections. Built from the canonical
 * (unfiltered) list so a number is stable regardless of the active type/status filter.
 */
export function buildNumbering(all: CorrectionDto[]): (id: string) => number {
  const ordered = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, number>();
  ordered.forEach((c, i) => map.set(c.id, i + 1));
  return (id: string) => map.get(id) ?? 0;
}
