// MC-1 — "Trouver un·e partenaire". Thin server shell (pattern: ma-liste/galerie) around the
// client component; the Header's "Trouver" nav link already points here.
import TrouverClient from '../../components/trouver/TrouverClient';

export const metadata = { title: 'Trouver un·e partenaire — Encre & Plume' };

export default function TrouverPage() {
  return <TrouverClient />;
}
