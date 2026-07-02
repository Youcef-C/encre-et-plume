// F-13: Politique de confidentialité page — server component.
import type { Metadata } from 'next';
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
