'use client';

// MC-6 — "Mes candidatures" (route /mes-candidatures). Replica of prototype MES CANDIDATURES
// (.dc.html lines 2152–2179): back link + title + tagline, a status-chip filter row, and full-width
// application rows (thumb · title/meta/date · status badge · "Voir l'appel"). Owner extension: a
// "Retirer" action on pending rows with an inline on-brand confirm (no browser confirm()).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  GENRES,
  type ApplicationSample,
  type CallCard,
  type CallDirection,
  type CreatorRole,
  type MyApplicationRow,
  type MyApplicationsResponse,
  type MyApplicationsStatusFilter,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { useMessaging } from '../../lib/messaging';
import * as api from '../../lib/api';
import { useFetchState, useOverride } from '../../lib/useFetchState';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import StatusBadge from './StatusBadge';
import ApplicationDetailModal from './ApplicationDetailModal';
import ApplyCallModal from '../appels/ApplyCallModal';

type Screen = 'loading' | 'ready' | 'empty' | 'error';

// Direction labels — sentence-case, verbatim from the prototype rows (2161/2167). The board's
// server `heading` is uppercase; these are the "Mes candidatures" variant.
const DIRECTION_LABEL: Record<CallDirection, string> = {
  writerSeeksIllustrator: 'Scénariste cherche dessinateur·rice',
  illustratorSeeksWriter: 'Dessinateur cherche scénariste',
};

const GENRE_FR = new Map(GENRES.map((g) => [g.id, g.fr]));

// Lowercase for the inline "En tant que …" sentence (dual-role applicants only; null otherwise).
const APPLIED_AS_LABEL: Record<CreatorRole, string> = {
  scenariste: 'scénariste',
  dessinateur: 'dessinateur·rice',
};

const CHIPS: { key: MyApplicationsStatusFilter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'pending', label: 'En attente' },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'rejected', label: 'Refusées' },
];

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

const chipBase: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '8px 12px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...chipBase, background: 'var(--accent)', color: '#fff' }
    : { ...chipBase, background: 'var(--card)', color: 'var(--ink)' };
}

// Halftone-dot placeholder for a call with no cover (all seeded rows) — mirrors the board card.
const placeholderThumb: React.CSSProperties = {
  width: 60,
  height: 80,
  flex: 'none',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  backgroundColor: 'var(--accent)',
  backgroundImage:
    'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(150deg,var(--ink) 42%,var(--accent) 42%)',
  backgroundSize: 'var(--dot) var(--dot),cover',
};

// Layout-only; color/border idiom via .ep-btn-secondary (or -primary) at each call site.
const actionBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  padding: '7px 13px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

// MC-6 amendment: a MyApplicationRow lacks the call's seekingRoles/seats — build the minimal CallCard the
// reused ApplyCallModal reads (header title/heading + owner) for edit mode. appliedAs is immutable there.
function toEditCall(app: MyApplicationRow): CallCard {
  return {
    id: app.callId,
    heading: DIRECTION_LABEL[app.callDirection],
    title: app.callTitle,
    tags: [],
    authorName: app.ownerName,
    authorAvatar: null,
    closesInDays: null,
    applicationCount: 0,
    direction: app.callDirection,
    seekingRoles: app.appliedAs ? [app.appliedAs] : [],
    seats: {},
    acceptedByRole: {},
    remainingSeats: 0,
    description: '',
    sampleUrl: app.callSampleUrl,
    status: 'open',
    deadline: null,
    isOwner: false,
    hasApplied: true,
    myApplicationId: app.id,
    myApplicationStatus: app.status,
    viewerHasRole: true,
  };
}

function ApplicationRow({
  app,
  onWithdrawn,
  onEdited,
}: {
  app: MyApplicationRow;
  onWithdrawn: (id: string) => void;
  // MC-6 amendment: after an edit save, refresh the list (message/samples may have changed).
  onEdited: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // Edit: fetch the detail first (the list row omits the message; the detail's samples carry their refs),
  // then open the pre-filled ApplyCallModal.
  const [editState, setEditState] = useState<'idle' | 'loading' | 'error' | 'open'>('idle');
  const [editInitial, setEditInitial] = useState<{ message: string; samples: ApplicationSample[] }>({ message: '', samples: [] });
  const { openDm } = useMessaging();

  async function openEdit() {
    setEditState('loading');
    try {
      const detail = await api.getMyApplication(app.id);
      setEditInitial({ message: detail.message ?? '', samples: detail.samples });
      setEditState('open');
    } catch {
      setEditState('error');
    }
  }

  const genreLabel = app.callGenres.length ? GENRE_FR.get(app.callGenres[0]) ?? app.callGenres[0] : null;
  const meta = [DIRECTION_LABEL[app.callDirection], genreLabel, app.ownerName].filter(Boolean).join(' · ');
  // MC-4X: the applicant's own first image sample feeds the row thumb; the call cover is the fallback.
  const thumbUrl = app.samples.find((s) => s.kind === 'image')?.url ?? app.callSampleUrl;

  async function confirmWithdraw() {
    setBusy(true);
    setError(false);
    try {
      await api.withdrawApplication(app.id);
      onWithdrawn(app.id);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <li
      id={`candidature-${app.id}`}
      className="ep-candidature-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        padding: 14,
        boxShadow: '4px 4px 0 var(--shadow)',
        ...(app.status === 'rejected' ? { opacity: 0.72 } : {}),
      }}
    >
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          width={60}
          height={80}
          style={{ width: 60, height: 80, flex: 'none', objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 5 }}
        />
      ) : (
        <div aria-hidden="true" style={placeholderThumb} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 16 }}>{app.callTitle}</b>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>{meta}</div>
        <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 5 }}>
          Candidaté le {dateFmt.format(new Date(app.createdAt))}
        </div>
        {app.appliedAs && (
          <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 4 }}>
            En tant que {APPLIED_AS_LABEL[app.appliedAs]}
          </div>
        )}
      </div>

      <StatusBadge status={app.status} />

      {/* Actions. MC-9: accepted rows also expose the "Message" CTA.
          MC-6 amendment: "Retirer" (withdraw) is available on pending AND accepted rows — withdrawing an
          accepted application frees the call seat server-side. Rejected rows have nothing to withdraw. */}
      <div className="ep-candidature-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {app.status !== 'rejected' &&
          (confirming ? (
            <span role="group" aria-label="Confirmer le retrait de la candidature" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={confirmWithdraw} disabled={busy} className="ep-btn-primary" style={actionBtn}>
                Confirmer le retrait
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="ep-btn-secondary" style={actionBtn}>
                Annuler
              </button>
              {error && (
                <span role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                  Retrait impossible.
                </span>
              )}
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="ep-btn-secondary" style={actionBtn}>
              Retirer
            </button>
          ))}
        {app.status === 'accepted' && app.ownerId && (
          <button
            type="button"
            onClick={() => void openDm(app.ownerId as string)}
            aria-label={`Message à ${app.ownerName}`}
            className="ep-btn-primary"
            style={{ ...actionBtn, boxShadow: '2px 2px 0 var(--shadow)' }}
          >
            Message
          </button>
        )}

        {/* MC-6 amendment: "Voir" (detail, all statuses) + "Modifier" (pending only). */}
        <button type="button" onClick={() => setDetailOpen(true)} className="ep-btn-secondary" style={actionBtn}>
          Voir
        </button>
        {app.status === 'pending' && (
          <button
            type="button"
            onClick={() => void openEdit()}
            disabled={editState === 'loading'}
            aria-label={`Modifier ma candidature pour « ${app.callTitle} »`}
            className="ep-btn-secondary"
            style={{ ...actionBtn, opacity: editState === 'loading' ? 0.6 : 1 }}
          >
            {editState === 'loading' ? 'Ouverture…' : 'Modifier'}
          </button>
        )}

        <Link href={`/appels?call=${app.callId}`} aria-label={`Voir l'appel « ${app.callTitle} »`} className="ep-btn-secondary" style={actionBtn}>
          Voir l&apos;appel
        </Link>
      </div>

      {editState === 'error' && (
        <span role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
          Ouverture impossible.
        </span>
      )}

      {detailOpen && (
        <ApplicationDetailModal applicationId={app.id} callTitle={app.callTitle} onClose={() => setDetailOpen(false)} />
      )}

      {editState === 'open' && (
        <ApplyCallModal
          call={toEditCall(app)}
          edit={{ applicationId: app.id, initialMessage: editInitial.message, initialSamples: editInitial.samples }}
          onClose={() => setEditState('idle')}
          onApplied={() => {
            setEditState('idle');
            onEdited();
          }}
        />
      )}
    </li>
  );
}

function SkeletonRow() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{ listStyle: 'none', height: 108, border: '3px solid var(--ink)', borderRadius: 10, background: 'var(--tone)', opacity: 0.5 }}
    />
  );
}

export default function MesCandidaturesClient() {
  const { account, loading: sessionLoading } = useSession();

  const [filter, setFilter] = useState<MyApplicationsStatusFilter>('all');
  // DR-14: the shared hook owns the load; appended pages and the local withdraw edit layer on top.
  const feed = useFetchState(
    () => (account ? api.getMyApplications({ status: filter, page: 1 }) : Promise.resolve(null)),
    [account, filter],
  );
  const [data, setData] = useOverride<MyApplicationsResponse | null>(feed.data);
  const items: MyApplicationRow[] = data?.items ?? [];
  const totalAll = data?.totalAll ?? 0;
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const screen: Screen =
    feed.state === 'loading' ? 'loading' : feed.state === 'error' ? 'error' : items.length === 0 ? 'empty' : 'ready';

  async function loadMore() {
    const res = await api.getMyApplications({ status: filter, page: page + 1 });
    setData((prev) => (prev ? { ...res, items: [...prev.items, ...res.items] } : res));
  }

  const hasMore = screen === 'ready' && total > items.length;
  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Owner extension: after a successful withdraw, drop the row and adjust the counts locally.
  function handleWithdrawn(id: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((a) => a.id !== id),
            total: Math.max(0, prev.total - 1),
            totalAll: Math.max(0, prev.totalAll - 1),
          }
        : prev,
    );
  }

  const backLink = useMemo(
    () => (
      <Link href="/appels" className="ep-back-link" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }}>
        ‹ Appels
      </Link>
    ),
    [],
  );

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Mes candidatures</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour retrouver vos candidatures.
        </p>
        <Link
          href="/connexion?redirect=/mes-candidatures"
          className="ep-btn-primary"
          style={{
            display: 'inline-block',
            fontSize: 14,
            border: '2px solid var(--ink)',
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Header (prototype 2155–2156) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6, flexWrap: 'wrap' }}>
        {backLink}
        <h1 style={{ fontSize: 38, textTransform: 'uppercase', margin: 0 }}>Mes candidatures</h1>
      </div>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20 }}>
        Les appels à projets auxquels vous avez postulé.
      </div>

      {/* Status chips (prototype 2157) — auto-apply, no "Appliquer". */}
      <div role="group" aria-label="Filtrer par statut" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CHIPS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              style={chipStyle(active)}
            >
              {key === 'all' ? `Toutes · ${totalAll}` : label}
            </button>
          );
        })}
      </div>

      {screen === 'loading' && (
        <ul
          role="status"
          aria-label="Chargement de vos candidatures…"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {screen === 'error' && (
        <div role="alert" style={{ padding: '20px 0' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Impossible de charger vos candidatures.
          </p>
          <button
            type="button"
            onClick={feed.retry}
            className="ep-btn-primary"
            style={{
              fontSize: 13,
              border: '2px solid var(--ink)',
              padding: '8px 16px',
              fontFamily: 'inherit',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {screen === 'empty' && (
        <p style={{ color: 'var(--ink2)', fontSize: 15, padding: '20px 0' }}>
          Vous n&rsquo;avez pas encore candidaté.{' '}
          <Link href="/appels" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Appels à projets
          </Link>
        </p>
      )}

      {screen === 'ready' && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {items.map((app) => (
              <ApplicationRow
                key={app.id}
                app={app}
                onWithdrawn={handleWithdrawn}
                onEdited={feed.retry}
              />
            ))}
          </ul>
          {total > items.length && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              {/* Auto-load sentinel — fires loadMore on scroll; the button stays as a fallback. */}
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
              <button
                type="button"
                onClick={loadMore}
                className="ep-btn-secondary"
                style={{
                  fontSize: 13,
                  border: '2px solid var(--ink)',
                  padding: '10px 20px',
                  boxShadow: '2px 2px 0 var(--shadow)',
                  fontFamily: 'inherit',
                }}
              >
                Charger plus
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
