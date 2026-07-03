// F-13: Mentions légales page — server component.
import type { Metadata } from 'next';

// Fetches live API content — must not be statically prerendered at build time
// (the root layout no longer forces dynamic rendering since the theme cookie read was removed).
export const dynamic = 'force-dynamic';
import { getLegalDocument } from '../../lib/api';
import LegalPage from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Mentions légales — Encre & Plume',
};

export default async function MentionsLegalesPage() {
  try {
    const doc = await getLegalDocument('mentions');
    return <LegalPage doc={doc} />;
  } catch {
    return <LegalPage error="Contenu indisponible pour le moment." />;
  }
}
