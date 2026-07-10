'use client';

// CS-1 — the standalone "Publier une illustration" page is superseded by the Illustration branch of
// the /creer "Nouveau projet" wizard. This is now a thin redirect (no dead route; bookmarks/old links
// keep working), forwarding any ?collection param so the create-and-add flow still preselects it.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PublishIllustrationRedirect() {
  const router = useRouter();

  useEffect(() => {
    const collection = new URLSearchParams(window.location.search).get('collection');
    router.replace(
      collection ? `/creer?type=illustration&collection=${encodeURIComponent(collection)}` : '/creer?type=illustration',
    );
  }, [router]);

  return (
    <div role="status" aria-label="Redirection…" style={{ maxWidth: 740, margin: '0 auto', padding: 30 }}>
      <div aria-hidden="true" style={{ height: 420, background: 'var(--tone)', opacity: 0.4, borderRadius: 12 }} />
    </div>
  );
}
