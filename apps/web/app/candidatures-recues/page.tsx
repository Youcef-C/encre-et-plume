// MC-7 — "Mes appels à projets": applications received on the current user's own calls.
import CandidaturesRecuesClient from '../../components/candidatures/CandidaturesRecuesClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Mes appels à projets — Encre & Plume', robots: { index: false, follow: false } };

export default function CandidaturesRecuesPage() {
  return <CandidaturesRecuesClient />;
}
