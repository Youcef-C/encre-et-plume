// MC-1 §11 — minimal "Appels à projets" board. Reuses GET /calls (no new backend); MC-4 replaces
// this with the full board (posting, filters, pagination).
import AppelsClient from '../../components/appels/AppelsClient';

export const metadata = { title: 'Appels à projets — Encre & Plume' };

export default function AppelsPage() {
  return <AppelsClient />;
}
