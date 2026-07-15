// CS-5 — "/projet/[slug]/revision/[pageId]" route. Thin server shell; the client component gates on
// the session and fetches the two-version review payload (mirrors the CS-4 editor shell pattern).
import ReviewClient from '../../../../../components/revision/ReviewClient';

export default async function RevisionPage({
  params,
}: {
  params: Promise<{ slug: string; pageId: string }>;
}) {
  const { slug, pageId } = await params;
  return <ReviewClient slug={slug} pageId={pageId} />;
}
