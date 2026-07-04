// DR-6 FE-T1 — small formatting helper for the illustration detail screen "Détails" sidebar.
export function formatPublishedDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
