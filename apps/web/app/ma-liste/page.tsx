// DR-8 — "Ma liste & coups de cœur". Thin server shell around the client component (pattern:
// classement/galerie) — the Header's ♥ Ma liste pill already links here.
import MaListeClient from '../../components/maliste/MaListeClient';

export const metadata = { title: 'Ma liste — Encre & Plume' };

export default function MaListePage() {
  return <MaListeClient />;
}
