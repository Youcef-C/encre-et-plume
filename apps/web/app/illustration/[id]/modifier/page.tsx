// CS-13 — full-page owner editor "/illustration/{id}/modifier". Server component wrapper: resolves
// the dynamic id then delegates to the client component that handles session, fetching, owner-gating,
// and the PATCH round-trip. Owner-gating is enforced server-side on PATCH; the client mirrors it.
import ModifierIllustrationClient from '../../../../components/illustration/ModifierIllustrationClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Modifier l’illustration — Encre & Plume', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

export default async function ModifierIllustrationPage({ params }: Props) {
  const { id } = await params;
  return <ModifierIllustrationClient id={id} />;
}
