// F-2 — Public profile page.
// Server component wrapper: resolves the dynamic slug then delegates to the
// client component that handles session, fetching, and all interactive states.
//
// F-24 — THIS IS THE ROOT CATCH-ALL. Every unknown top-level URL lands here, and until this file
// called `notFound()` it answered HTTP 200 with a client-rendered "Profil introuvable" — an
// unbounded set of indexable garbage URLs. `notFoundOn404` is the fix; a 403 still passes through
// so a gated profile renders its own state.
import type { Metadata } from 'next';
import ProfilePageClient from '../../components/ProfilePageClient';
import JsonLd from '../../components/JsonLd';
import {
  buildMetadata,
  breadcrumbJsonLd,
  getProfileSeo,
  notFoundOn404,
  profileJsonLd,
  seoDescription,
} from '../../lib/seo';

type Props = { params: Promise<{ slug: string }> };

const DEFAULT_DESCRIPTION = 'Profil créateur·rice sur Encre & Plume.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: profile, status } = await getProfileSeo(slug);
  notFoundOn404(status);
  const path = `/${slug}`;
  if (!profile) return buildMetadata({ title: 'Profil', description: DEFAULT_DESCRIPTION, path, noindex: status === 403 });

  return buildMetadata({
    title: profile.displayName,
    description: seoDescription(
      profile.bio,
      profile.roleLine
        ? `${profile.displayName} — ${profile.roleLine} sur Encre & Plume.`
        : `Le profil de ${profile.displayName} sur Encre & Plume.`,
    ),
    path,
    image: profile.avatar,
    type: 'profile',
  });
}

export default async function ProfilePage({ params }: Props) {
  const { slug } = await params;
  const { data: profile, status } = await getProfileSeo(slug);
  notFoundOn404(status);

  return (
    <>
      {profile && (
        <>
          <JsonLd data={profileJsonLd(profile)} />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: 'Accueil', path: '/' },
              { name: profile.displayName, path: `/${profile.slug}` },
            ])}
          />
        </>
      )}
      <ProfilePageClient slug={slug} initialProfile={profile} />
    </>
  );
}
