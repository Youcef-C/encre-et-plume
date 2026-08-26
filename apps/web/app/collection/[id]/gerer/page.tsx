// DR-12 FE-4 — manage-collection route. Server component wrapper resolves the dynamic id then
// delegates to the owner-gated client (fetch, session, and all states live there).
import ManageCollectionClient from '../../../../components/collections/ManageCollectionClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Gérer la collection — Encre & Plume', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

export default async function ManageCollectionPage({ params }: Props) {
  const { id } = await params;
  return <ManageCollectionClient id={id} />;
}
