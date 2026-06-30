// F-2 — Public profile page.
// Server component wrapper: resolves the dynamic slug then delegates to the
// client component that handles session, fetching, and all interactive states.
import ProfilePageClient from '../../components/ProfilePageClient';

type Props = { params: Promise<{ slug: string }> };

export default async function ProfilePage({ params }: Props) {
  const { slug } = await params;
  return <ProfilePageClient slug={slug} />;
}
