'use client';

// CS-24 — deep-link resolver for a correction notification. F-5 notifications carry a bare uuid in
// `refId`, so the target has to be resolved: GET /corrections/:id/location → the review screen with
// that correction selected. Anything else (CS-2 stores a PROJECT id in the same column) FAILS CLOSED
// to /projets, exactly where those notifications land today.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';

export default function CorrectionResolver({ id }: { id: string }) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    api
      .getCorrectionLocation(id)
      .then((loc) => {
        if (!alive) return;
        // CS-24 follow-up — route to the surface that can actually SHOW it. A `scenario` correction is
        // a tagged CS-4 comment living in the editor; the review list is dessin-only (CS-5 r4), so
        // sending one to /revision landed the reader on a list it could never appear in.
        if (loc.type === 'scenario') {
          const asset = loc.assetId ? `?asset=${encodeURIComponent(loc.assetId)}` : '';
          router.replace(`/projet/${loc.projectSlug}/editeur/${loc.pageId}${asset}`);
          return;
        }
        router.replace(`/projet/${loc.projectSlug}/revision/${loc.pageId}?correction=${encodeURIComponent(id)}`);
      })
      .catch(() => alive && router.replace('/projets'));
    return () => {
      alive = false;
    };
  }, [id, router]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ maxWidth: 620, margin: '48px auto', padding: '0 20px', fontSize: 14, color: 'var(--ink2)' }}
    >
      Ouverture de la correction…
    </div>
  );
}
