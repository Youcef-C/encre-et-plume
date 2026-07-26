'use client';

// Guest-only route guard: sends an already-signed-in visitor away from the auth pages (/connexion,
// /inscription). Session state is client-side (SessionProvider fetches /auth/me), so there is no
// server-side redirect to do this in — same shape as the OnboardingClient guard.
//
// Children render while the session is still resolving: a guest is the overwhelmingly common visitor
// here, and blanking the login form during every /auth/me round-trip would be a worse regression than
// the brief form flash a signed-in visitor sees before the redirect.
//
// This is a UX guard, not a security control — nothing sensitive is behind these pages, and the API
// enforces auth server-side regardless.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../lib/session';

export default function GuestOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { account, loading } = useSession();

  useEffect(() => {
    if (!loading && account) router.replace('/');
  }, [account, loading, router]);

  if (!loading && account) return null;
  return <>{children}</>;
}
