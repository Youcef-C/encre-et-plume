// CS-24 — "/revision/c/[id]" — the notification deep link. Thin server shell; the client component
// resolves the uuid against the API (session cookie lives in the browser) and redirects.
import CorrectionResolver from '../../../../components/revision/CorrectionResolver';

export default async function CorrectionRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CorrectionResolver id={id} />;
}
