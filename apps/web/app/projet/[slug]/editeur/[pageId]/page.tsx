// CS-4 — "/projet/[slug]/editeur/[pageId]" route. Thin server shell; the client component gates on
// the session and fetches the editor document (mirrors the CS-2 workspace shell pattern). An optional
// `?asset=<id>` (D9) opens a chosen scenario/texte asset into the editor instead of the card default.
import EditorClient from '../../../../../components/editeur/EditorClient';

export default async function EditeurPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; pageId: string }>;
  searchParams: Promise<{ asset?: string }>;
}) {
  const { slug, pageId } = await params;
  const { asset } = await searchParams;
  return <EditorClient slug={slug} pageId={pageId} assetId={asset ?? null} />;
}
