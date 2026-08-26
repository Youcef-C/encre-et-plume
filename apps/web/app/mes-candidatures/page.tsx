// MC-6 — "Mes candidatures": the current user's submitted applications with status tracking.
import MesCandidaturesClient from '../../components/candidatures/MesCandidaturesClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Mes candidatures — Encre & Plume', robots: { index: false, follow: false } };

export default function MesCandidaturesPage() {
  return <MesCandidaturesClient />;
}
