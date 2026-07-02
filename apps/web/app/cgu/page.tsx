// F-13: CGU page — server component fetching the current published document.
import type { Metadata } from 'next';
import { getLegalDocument } from '../../lib/api';
import LegalPage from '../../components/LegalPage';

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — Encre & Plume",
};

export default async function CguPage() {
  try {
    const doc = await getLegalDocument('cgu');
    return <LegalPage doc={doc} />;
  } catch {
    return <LegalPage error="Contenu indisponible pour le moment." />;
  }
}
