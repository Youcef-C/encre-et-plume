// F-13: Politique de confidentialité page — server component.
import type { Metadata } from 'next';

// Fetches live API content — must not be statically prerendered at build time
// (the root layout no longer forces dynamic rendering since the theme cookie read was removed).
export const dynamic = 'force-dynamic';
import { getLegalDocument } from '../../lib/api';
import LegalPage from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Encre & Plume',
};

export default async function ConfidentialitePage() {
  try {
    const doc = await getLegalDocument('privacy');
    return <LegalPage doc={doc} />;
  } catch {
    return <LegalPage error="Contenu indisponible pour le moment." />;
  }
}
