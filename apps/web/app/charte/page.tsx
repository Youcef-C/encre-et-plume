// Charte de la communauté — integral part of the CGU (CGU art. 2 & 3), so it has its own page.
// Server component fetching the current published document, same shape as /cgu.
import type { Metadata } from 'next';

// Fetches live API content — must not be statically prerendered at build time
// (the root layout no longer forces dynamic rendering since the theme cookie read was removed).
export const dynamic = 'force-dynamic';
import { getLegalDocument } from '../../lib/api';
import LegalPage from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Charte de la communauté — Encre & Plume',
};

export default async function ChartePage() {
  try {
    const doc = await getLegalDocument('charte');
    return <LegalPage doc={doc} />;
  } catch {
    return <LegalPage error="Contenu indisponible pour le moment." />;
  }
}
