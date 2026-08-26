// DR-6 — Illustration detail "/illustration/{id}". Server component wrapper: resolves the dynamic
// id then delegates to the client component that handles fetching, session, and all states.
//
// F-24: same one-fetch-per-request pattern as `/oeuvre/[slug]` — metadata, JSON-LD, the real 404
// and the `initialIllustration` seed all come from a single anonymous `getIllustrationSeo(id)`.
import type { Metadata } from 'next';
import IllustrationClient from '../../../components/illustration/IllustrationClient';
import JsonLd from '../../../components/JsonLd';
import {
  buildMetadata,
  breadcrumbJsonLd,
  getIllustrationSeo,
  illustrationJsonLd,
  notFoundOn404,
  seoDescription,
} from '../../../lib/seo';

type Props = { params: Promise<{ id: string }> };

const DEFAULT_DESCRIPTION = 'Illustration publiée sur Encre & Plume.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data: illustration, status } = await getIllustrationSeo(id);
  notFoundOn404(status);
  const path = `/illustration/${id}`;
  if (!illustration) {
    return buildMetadata({ title: 'Illustration', description: DEFAULT_DESCRIPTION, path, noindex: status === 403 });
  }

  return buildMetadata({
    title: illustration.title,
    description: seoDescription(
      illustration.description,
      `${illustration.title} par ${illustration.artist.name} — illustration publiée sur Encre & Plume.`,
    ),
    path,
    image: illustration.image,
    type: 'article',
    noindex: illustration.is18plus, // D-2: a crawler is anonymous, so it would only ever get a 403.
  });
}

export default async function IllustrationPage({ params }: Props) {
  const { id } = await params;
  const { data: illustration, status } = await getIllustrationSeo(id);
  notFoundOn404(status);

  return (
    <>
      {illustration && (
        <>
          <JsonLd data={illustrationJsonLd(illustration)} />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: 'Accueil', path: '/' },
              { name: 'Galerie', path: '/galerie' },
              { name: illustration.title, path: `/illustration/${illustration.id}` },
            ])}
          />
        </>
      )}
      <IllustrationClient id={id} initialIllustration={illustration} />
    </>
  );
}
