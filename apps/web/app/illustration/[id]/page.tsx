// DR-6 — Illustration detail "/illustration/{id}". Server component wrapper: resolves the dynamic
// id then delegates to the client component that handles fetching, session, and all states.
import IllustrationClient from '../../../components/illustration/IllustrationClient';

export const metadata = { title: 'Illustration — Encre & Plume' };

type Props = { params: Promise<{ id: string }> };

export default async function IllustrationPage({ params }: Props) {
  const { id } = await params;
  return <IllustrationClient id={id} />;
}
