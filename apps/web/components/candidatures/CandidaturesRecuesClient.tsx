'use client';

// MC-7 — "Mes appels à projets" (route /candidatures-recues). Replica of the drawn prototype frame
// `data-page="candidatsrecus"` (Encre et Plume - Prototype.dc.html:2181-2201): a single-call SELECTOR
// + accent count badge over the grouped `GET /me/calls/applications` response, then the selected call's
// applicant cards (circular avatar, accent role chip, quoted message, sample thumbs, Voir le profil /
// green Accepter / red Refuser). "Voir l'appel" opens the shared CallDetailModal in-page (no navigation).
// Recorded deviations from the frame live in plan §4.D (h1 rename, no affinité %/city/Message, PDF rows,
// 44px tap targets, resolved-row states).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ApplicationDto, CreatorRole, ReceivedCallGroup } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { formatBytes } from '../../lib/format';
import OnBrandSelect from '../form/OnBrandSelect';
import CallDetailModal from '../appels/CallDetailModal';
import { BrushIcon, PenNibIcon } from '../icons';
import StatusBadge from './StatusBadge';

type Screen = 'loading' | 'ready' | 'empty' | 'error';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

// Role label — the applicant's applied-as role wins, else their primary creator role.
const ROLE_LABEL: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};

const placeholderAvatar: React.CSSProperties = {
  width: 48,
  height: 48,
  flex: 'none',
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  backgroundColor: 'var(--tone)',
};

// Prototype action buttons: 12px / 700, ink border, radius 6, 6px 13px — with a 44px a11y tap floor (D10).
const actionBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '6px 13px',
  minHeight: 44,
  background: 'var(--card)',
  color: 'var(--ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

const decideBtn = (background: string): React.CSSProperties => ({
  ...actionBtn,
  background,
  color: '#fff',
  boxShadow: '2px 2px 0 var(--shadow)',
});

const sampleThumb: React.CSSProperties = {
  width: 46,
  height: 60,
  flex: 'none',
  objectFit: 'cover',
  border: '2px solid var(--ink)',
  borderRadius: 4,
};

function ApplicantRow({
  app,
  onDecided,
}: {
  app: ApplicationDto;
  onDecided: (id: string, next: ApplicationDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const role = app.appliedAs ?? app.applicant.role;
  const roleLabel = role ? ROLE_LABEL[role] : null;
  const RoleIcon = role === 'dessinateur' ? BrushIcon : PenNibIcon;

  async function decide(status: 'accepted' | 'rejected') {
    setBusy(true);
    setError(false);
    try {
      const next = await api.decideApplication(app.id, status);
      onDecided(app.id, next);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <li
      className="ep-candidature-row"
      aria-busy={busy || undefined}
      style={{
        display: 'flex',
        gap: 16,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        padding: 14,
        boxShadow: '4px 4px 0 var(--shadow)',
        ...(app.status === 'rejected' ? { opacity: 0.72 } : {}),
      }}
    >
      {app.applicant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.applicant.avatarUrl}
          alt=""
          width={48}
          height={48}
          style={{ ...placeholderAvatar, objectFit: 'cover' }}
        />
      ) : (
        <span aria-hidden="true" style={placeholderAvatar} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row: plain bold name + accent role chip (proto line 2189, no emoji — D5). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{app.applicant.name}</b>
          {roleLabel && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                border: '2px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: 5,
                padding: '1px 8px',
              }}
            >
              <RoleIcon size={12} />
              {roleLabel}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink2)' }}>
            Candidaté le {dateFmt.format(new Date(app.createdAt))}
          </span>
        </div>

        {/* Applicant message (proto uses var(--ink), not italic). */}
        {app.message && (
          <div style={{ fontSize: 13, color: 'var(--ink)', margin: '6px 0 9px' }}>«&nbsp;{app.message}&nbsp;»</div>
        )}

        {/* Footer row: files bottom-left, actions bottom-right (wraps on mobile). */}
        <div className="ep-candidature-bottom" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          {/* Samples — image thumbs (46×60) / PDF links, viewable in a new tab, labelled with the applicant. */}
          {app.samples.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {app.samples.map((s, i) =>
                s.kind === 'image' ? (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Voir l'échantillon de ${app.applicant.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt="" width={46} height={60} style={sampleThumb} />
                  </a>
                ) : (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Voir l'échantillon de ${app.applicant.name}`}
                    style={actionBtn}
                  >
                    PDF{s.size != null ? ` · ${formatBytes(s.size)}` : ''}
                  </a>
                ),
              )}
            </div>
          )}

          {/* Action row (proto line 2189): Voir le profil / green Accepter / red Refuser — stuck right. */}
          <div className="ep-candidature-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <Link href={`/${app.applicant.slug}`} style={actionBtn}>
              Voir le profil
            </Link>

            {app.status === 'pending' ? (
              <>
                <button
                  type="button"
                  onClick={() => decide('accepted')}
                  disabled={busy}
                  aria-label={`Accepter la candidature de ${app.applicant.name}`}
                  style={decideBtn('#1f8a5b')}
                >
                  Accepter
                </button>
                <button
                  type="button"
                  onClick={() => decide('rejected')}
                  disabled={busy}
                  aria-label={`Refuser la candidature de ${app.applicant.name}`}
                  style={decideBtn('var(--accent)')}
                >
                  Refuser
                </button>
              </>
            ) : (
              <StatusBadge status={app.status} />
            )}
          </div>
        </div>

        {error && (
          <span role="alert" style={{ display: 'block', textAlign: 'right', fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 6 }}>
            Action impossible.
          </span>
        )}
      </div>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{ listStyle: 'none', height: 120, border: '3px solid var(--ink)', borderRadius: 10, background: 'var(--tone)', opacity: 0.5 }}
    />
  );
}

export default function CandidaturesRecuesClient() {
  const { account, loading: sessionLoading } = useSession();

  const [groups, setGroups] = useState<ReceivedCallGroup[]>([]);
  const [screen, setScreen] = useState<Screen>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [selectedCallId, setSelectedCallId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setScreen('loading');
    api
      .getReceivedApplications()
      .then((res) => {
        if (cancelled) return;
        setGroups(res.groups);
        // Preserve the active selection across a refetch (e.g. after an owner edit while the modal is
        // open); only fall back to the newest call when the selected one is gone (e.g. after a delete).
        setSelectedCallId((cur) =>
          res.groups.some((g) => g.callId === cur) ? cur : res.groups[0]?.callId ?? '',
        );
        setScreen(res.groups.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setScreen('error');
      });
    return () => {
      cancelled = true;
    };
  }, [account, retryKey]);

  // Selected group — falls back to the first when the id hasn't been set / no longer exists.
  const selected = useMemo(
    () => groups.find((g) => g.callId === selectedCallId) ?? groups[0],
    [groups, selectedCallId],
  );

  function handleDecided(callId: string, appId: string, next: ApplicationDto) {
    setGroups((prev) =>
      prev.map((g) =>
        g.callId !== callId ? g : { ...g, applications: g.applications.map((a) => (a.id === appId ? next : a)) },
      ),
    );
    setAnnounce(
      next.status === 'accepted'
        ? `Candidature de ${next.applicant.name} acceptée.`
        : `Candidature de ${next.applicant.name} refusée.`,
    );
  }

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Mes appels à projets</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour consulter les candidatures reçues sur vos appels.
        </p>
        <Link
          href="/connexion?redirect=/candidatures-recues"
          style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const count = selected?.applications.length ?? 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Live region — polite announcement after a decision. */}
      <div role="status" aria-label="Décision sur une candidature" aria-live="polite" className="sr-only">
        {announce}
      </div>

      {/* Header row (proto line 2184). h1 renamed per story (D1). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6, flexWrap: 'wrap' }}>
        <Link href="/appels" className="ep-back-link" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }}>
          ‹ Appels
        </Link>
        <h1 style={{ fontSize: 38, textTransform: 'uppercase', margin: 0 }}>Mes appels à projets</h1>
      </div>

      {screen === 'loading' && (
        <ul
          role="status"
          aria-label="Chargement des candidatures reçues…"
          style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {screen === 'error' && (
        <div role="alert" style={{ padding: '20px 0' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Impossible de charger les candidatures reçues.
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {screen === 'empty' && (
        <p style={{ color: 'var(--ink2)', fontSize: 15, padding: '20px 0' }}>
          Aucune candidature reçue pour le moment.{' '}
          <Link href="/appels" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Appels à projets
          </Link>
        </p>
      )}

      {screen === 'ready' && selected && (
        <>
          {/* Selector row (proto line 2185): "Pour votre appel :" + call picker + count badge + Voir l'appel. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>Pour votre appel :</span>
            <OnBrandSelect
              aria-label="Choisir l'appel"
              value={selected.callId}
              onChange={(e) => setSelectedCallId(e.target.value)}
              style={{ width: 'auto', fontSize: 13, padding: '6px 13px' }}
            >
              {groups.map((g) => (
                <option key={g.callId} value={g.callId}>
                  {`« ${g.callTitle} »`}
                </option>
              ))}
            </OnBrandSelect>
            <span
              style={{
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 5,
                padding: '3px 10px',
              }}
            >
              {count} candidature{count > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              aria-label={`Voir l'appel « ${selected.callTitle} »`}
              style={{ ...actionBtn, marginLeft: 'auto' }}
            >
              Voir l&apos;appel
            </button>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {selected.applications.map((app) => (
              <ApplicantRow
                key={app.id}
                app={app}
                onDecided={(id, next) => handleDecided(selected.callId, id, next)}
              />
            ))}
          </ul>

          {detailOpen && (
            <CallDetailModal
              callId={selected.callId}
              onClose={() => setDetailOpen(false)}
              onCandidater={() => {}}
              // Round 3: after an owner edit refetch (updated title/badge); after a delete close + refetch
              // (the removed call drops from the selector, selection falls back / lands on the empty state).
              onChanged={() => setRetryKey((k) => k + 1)}
              onDeleted={() => {
                setDetailOpen(false);
                setRetryKey((k) => k + 1);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
