// DR-3 — Work page "Œuvre". Server component wrapper: resolves the dynamic slug then delegates
// to the client component that handles fetching, session, and all interactive states.
//
// F-24: the wrapper now also does the anonymous public fetch ONCE per request — `generateMetadata`
// and the page below call `getWorkSeo(slug)` with identical arguments, so Next memoizes the second
// call. It feeds the metadata, the JSON-LD, the real 404, and the `initialWork` seed that puts the
// title and synopsis in the server HTML a crawler reads.
import type { Metadata } from 'next';
import { isWork18Plus } from '@encre-et-plume/shared';
import OeuvreClient from '../../../components/oeuvre/OeuvreClient';
import JsonLd from '../../../components/JsonLd';
import {
  buildMetadata,
  breadcrumbJsonLd,
  getWorkSeo,
  notFoundOn404,
  seoDescription,
  workJsonLd,
} from '../../../lib/seo';

type Props = { params: Promise<{ slug: string }> };

const DEFAULT_DESCRIPTION = 'Découvrez cette œuvre sur Encre & Plume.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: work, status } = await getWorkSeo(slug);
  notFoundOn404(status);
  const path = `/oeuvre/${slug}`;
  // 403 = DR-10's 18+/private gate. The page still renders the gate; it must not be indexed (D-2).
  if (!work) return buildMetadata({ title: 'Œuvre', description: DEFAULT_DESCRIPTION, path, noindex: status === 403 });

  return buildMetadata({
    title: work.title,
    description: seoDescription(work.synopsis, `${work.title} — ${work.genre} à lire sur Encre & Plume.`),
    path,
    image: work.cover,
    type: 'article',
    noindex: isWork18Plus(work.audienceRating),
  });
}

export default async function OeuvrePage({ params }: Props) {
  const { slug } = await params;
  const { data: work, status } = await getWorkSeo(slug);
  notFoundOn404(status);

  return (
    <>
      {work && (
        <>
          <JsonLd data={workJsonLd(work)} />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: 'Accueil', path: '/' },
              { name: 'Découvrir', path: '/decouvrir' },
              { name: work.title, path: `/oeuvre/${work.slug}` },
            ])}
          />
        </>
      )}
      <OeuvreClient slug={slug} initialWork={work} />
    </>
  );
}
