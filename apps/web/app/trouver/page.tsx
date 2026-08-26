// MC-1 — "Trouver un·e partenaire". Thin server shell (pattern: ma-liste/galerie) around the
// client component; the Header's "Trouver" nav link already points here.
import TrouverClient from '../../components/trouver/TrouverClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Trouver un·e partenaire — Encre & Plume', robots: { index: false, follow: false } };

export default function TrouverPage() {
  return <TrouverClient />;
}
