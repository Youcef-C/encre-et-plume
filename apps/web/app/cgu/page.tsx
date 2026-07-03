// F-13: CGU page — server component fetching the current published document.
import type { Metadata } from 'next';

// Fetches live API content — must not be statically prerendered at build time
// (the root layout no longer forces dynamic rendering since the theme cookie read was removed).
export const dynamic = 'force-dynamic';
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
