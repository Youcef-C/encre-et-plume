// DR-3 — Work page "Œuvre". Server component wrapper: resolves the dynamic slug then delegates
// to the client component that handles fetching, session, and all interactive states.
import OeuvreClient from '../../../components/oeuvre/OeuvreClient';

type Props = { params: Promise<{ slug: string }> };

export default async function OeuvrePage({ params }: Props) {
  const { slug } = await params;
  return <OeuvreClient slug={slug} />;
}
