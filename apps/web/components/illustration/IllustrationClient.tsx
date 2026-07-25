'use client';

// DR-6 FE-T1 — illustration detail "/illustration/{id}" orchestrator. Mirrors OeuvreClient's
// state machine (loading/notfound/error/ready); getIllustrationMore fetches independently so a
// failure there never blanks the rest of the page (DR-1 pattern).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ApiError, IllustrationDetail, GalleryIllustrationCard } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import AgeGate from '../age/AgeGate';
import IllustrationViewer from './IllustrationViewer';
import IllustrationMeta from './IllustrationMeta';
import IllustrationCollections from './IllustrationCollections';
import IllustrationComments from './IllustrationComments';
import ArtistSidebar from './ArtistSidebar';
import EditIllustrationForm from './EditIllustrationForm';

type State = 'loading' | 'ready' | 'notfound' | 'error' | 'age-refused';

export default function IllustrationClient({ id }: { id: string }) {
  const { account } = useSession();
  const router = useRouter();
  const cleared = useAgeCleared(account);
  const [state, setState] = useState<State>('loading');
  const [detail, setDetail] = useState<IllustrationDetail | null>(null);
  const [more, setMore] = useState<GalleryIllustrationCard[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // FE-13: owner-only edit of the illustration itself (distinct from the FE-5 collection-membership
  // "Modifier"). Saving commits the returned detail so title/byline/description/hashtags/Détails re-render.
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .getIllustration(id)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err);
        setState(err.error === 'AGE_RESTRICTED' ? 'age-refused' : err.statusCode === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, retryKey]);

  useEffect(() => {
    api.getIllustrationMore(id).then(setMore).catch(() => setMore([]));
  }, [id]);

  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label="Chargement de l'illustration…"
        className="ep-skeleton-delayed"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 28px 80px' }}
      >
        <div aria-hidden="true" style={{ height: 600, background: 'var(--tone)', opacity: 0.5, borderRadius: 12 }} />
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <Link href="/galerie" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Galerie
        </Link>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 56px)', textTransform: 'uppercase', margin: '20px 0 12px' }}>
          Illustration introuvable
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Cette illustration n&apos;existe pas ou a été dépubliée.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          {error?.message ?? 'Impossible de charger cette illustration.'}
        </p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="ep-btn-primary"
          style={{
            fontSize: 13,
            fontWeight: 700,
            border: '2px solid var(--ink)',
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  // DR-10: logged-in minor — server-side hard gate, no retry/bypass.
  if (state === 'age-refused') {
    return (
      <div role="alert" style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>
          {error?.message ?? 'Ce contenu est réservé aux adultes.'}
        </p>
        <Link href="/galerie" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Galerie
        </Link>
      </div>
    );
  }

  if (!detail) return null;

  // DR-10 (user-specified 2026-07-05): the gate now shows the page BLURRED behind it rather than
  // suppressing the content outright — real content only exists here once the server actually let
  // it load (visitor/self-declaration), unlike the 403 'age-refused' minor case above.
  const gated = detail.is18plus && !cleared;
  const isOwner = !!account && account.id === detail.artist.id;

  const content = (
    <>
      <Link href="/galerie" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
        ‹ Galerie
      </Link>

      <div className="ep-illustration-columns" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 24, marginTop: 14, alignItems: 'start' }}>
        <div>
          <IllustrationViewer detail={detail} account={account} />
          <IllustrationMeta detail={detail} />
          {isOwner && editOpen && (
            <EditIllustrationForm
              detail={detail}
              onClose={() => setEditOpen(false)}
              onSaved={(updated) => {
                setDetail(updated);
                setEditOpen(false);
              }}
            />
          )}
          <IllustrationComments account={account} />
        </div>

        <ArtistSidebar
          artist={detail.artist}
          categoryLabel={detail.categoryLabel}
          publishedAt={detail.publishedAt}
          dimensionsLabel={detail.dimensionsLabel}
          tools={detail.tools}
          license={detail.license ?? '© Tous droits réservés'}
          more={more}
          account={account}
          editAction={
            isOwner ? (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Modifier l'illustration"
                className="ep-btn-primary"
                style={{ display: 'block', width: '100%', fontSize: 14, fontWeight: 700, padding: '10px 14px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '4px 4px 0 var(--shadow)' }}
              >
                Modifier
              </button>
            ) : undefined
          }
          belowDetails={
            <IllustrationCollections
              detail={detail}
              account={account}
              onCollectionsChanged={(collections) =>
                setDetail((d) => (d ? { ...d, collections } : d))
              }
            />
          }
        />
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 28px 80px' }}>
      {/* AgeGate is a viewport-fixed overlay (no positioned ancestor needed), first in DOM order —
          see OeuvreClient for why this keeps the blurred content unreachable via the keyboard trap
          without extra `inert` plumbing. */}
      {gated && <AgeGate onBack={() => router.back()} />}
      {gated ? (
        <div aria-hidden="true" style={{ filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none' }}>
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  );
}
