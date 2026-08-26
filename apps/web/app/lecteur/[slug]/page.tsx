// DR-4 — Chapter reader "Lecteur". Server component wrapper: resolves the dynamic slug then
// delegates to the client Reader (fetching, session, ?chapitre= query, all interactive state).
// Suspense boundary required because Reader calls useSearchParams() (same pattern as
// app/decouvrir/page.tsx).
//
// F-24: metadata + the real 404 come from the same anonymous work fetch the œuvre page uses. The
// reader gets NO `initialData` seed (D-7): its subtree sits behind a Suspense boundary because of
// `useSearchParams()`, so it is not part of the initial HTML anyway, and its own content (the
// chapter planches) is a second fetch this wrapper does not make.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { isWork18Plus } from '@encre-et-plume/shared';
import Reader from '../../../components/lecteur/Reader';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, breadcrumbJsonLd, getWorkSeo, notFoundOn404, seoDescription } from '../../../lib/seo';

type Props = { params: Promise<{ slug: string }> };

const DEFAULT_DESCRIPTION = 'Lecture en ligne sur Encre & Plume.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: work, status } = await getWorkSeo(slug);
  notFoundOn404(status);
  const path = `/lecteur/${slug}`;
  if (!work) return buildMetadata({ title: 'Lecteur', description: DEFAULT_DESCRIPTION, path, noindex: status === 403 });

  return buildMetadata({
    title: `Lire ${work.title}`,
    description: seoDescription(work.synopsis, `Lisez ${work.title} en ligne sur Encre & Plume.`),
    path,
    image: work.cover,
    type: 'article',
    noindex: isWork18Plus(work.audienceRating),
  });
}

export default async function LecteurPage({ params }: Props) {
  const { slug } = await params;
  const { data: work, status } = await getWorkSeo(slug);
  notFoundOn404(status);

  return (
    <>
      {work && (
        <JsonLd
          data={breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: work.title, path: `/oeuvre/${work.slug}` },
            { name: 'Lecteur', path: `/lecteur/${work.slug}` },
          ])}
        />
      )}
      <Suspense
        fallback={<div role="status" aria-label="Chargement du lecteur…" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)' }} />}
      >
        <Reader slug={slug} />
      </Suspense>
    </>
  );
}
