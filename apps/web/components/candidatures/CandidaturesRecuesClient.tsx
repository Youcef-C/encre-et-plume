'use client';

// MC-7 — "Mes appels à projets" (route /candidatures-recues). Replica of the drawn prototype frame
// `data-page="candidatsrecus"` (Encre et Plume - Prototype.dc.html:2181-2201): a single-call SELECTOR
// + accent count badge over the grouped `GET /me/calls/applications` response, then the selected call's
// applicant cards (circular avatar, accent role chip, quoted message, sample thumbs, Voir le profil /
// green Accepter / red Refuser). "Voir l'appel" opens the shared CallDetailModal in-page (no navigation).
// Recorded deviations from the frame live in plan §4.D (h1 rename, no affinité %/city/Message, PDF rows,
// 44px tap targets, resolved-row states).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ApplicationDto, CreatorRole, ReceivedCallGroup } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { useFetchState, useOverride } from '../../lib/useFetchState';
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

// Prototype action buttons: 12px / 700, ink border, 6px 13px — with a 44px a11y tap floor (D10).
// Layout-only; color/border idiom via .ep-btn-secondary (or -success/-danger) at each call site.
const actionBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  padding: '6px 13px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

// Layout for the accept/reject decision buttons (color via .ep-btn-success / .ep-btn-danger).
const decideBtnLayout: React.CSSProperties = { ...actionBtn, boxShadow: '2px 2px 0 var(--shadow)' };

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
  onRemove,
  removeError,
}: {
  app: ApplicationDto;
  onDecided: (id: string, next: ApplicationDto) => void;
  // MC-7 amendment: fire-and-forget remove — the parent optimistically drops the row and rolls back on
  // error (re-mounting this row with removeError set). Distinct from "Refuser" (a pending→rejected flip).
  onRemove: () => void;
  removeError: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [removeConfirming, setRemoveConfirming] = useState(false);

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
                    className="ep-btn-secondary"
                    style={actionBtn}
                  >
                    PDF{s.size != null ? ` · ${formatBytes(s.size)}` : ''}
                  </a>
                ),
              )}
            </div>
          )}

          {/* Action row (proto line 2189): Voir le profil / green Accepter / red Refuser — stuck right.
              MC-7 amendment appends an owner "Retirer" (delete the applicant, any status). */}
          <div className="ep-candidature-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <Link href={`/${app.applicant.slug}`} className="ep-btn-secondary" style={actionBtn}>
              Voir le profil
            </Link>

            {app.status === 'pending' ? (
              <>
                <button
                  type="button"
                  onClick={() => decide('accepted')}
                  disabled={busy}
                  aria-label={`Accepter la candidature de ${app.applicant.name}`}
                  className="ep-btn-success"
                  style={decideBtnLayout}
                >
                  Accepter
                </button>
                <button
                  type="button"
                  onClick={() => decide('rejected')}
                  disabled={busy}
                  aria-label={`Refuser la candidature de ${app.applicant.name}`}
                  className="ep-btn-danger"
                  style={decideBtnLayout}
                >
                  Refuser
                </button>
              </>
            ) : (
              <StatusBadge status={app.status} />
            )}

            {/* Owner "Retirer" (delete) — with an inline on-brand confirm, no browser confirm(). */}
            {removeConfirming ? (
              <span role="group" aria-label={`Confirmer le retrait de ${app.applicant.name}`} style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setRemoveConfirming(false);
                    onRemove();
                  }}
                  className="ep-btn-primary"
                  style={{ ...actionBtn, boxShadow: '2px 2px 0 var(--shadow)' }}
                >
                  Confirmer le retrait
                </button>
                <button type="button" onClick={() => setRemoveConfirming(false)} className="ep-btn-secondary" style={actionBtn}>
                  Annuler
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setRemoveConfirming(true)}
                aria-label={`Retirer la candidature de ${app.applicant.name}`}
                className="ep-btn-secondary"
                style={actionBtn}
              >
                Retirer
              </button>
            )}
          </div>
        </div>

        {(error || removeError) && (
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

const NO_GROUPS: ReceivedCallGroup[] = [];

export default function CandidaturesRecuesClient() {
  const { account, loading: sessionLoading } = useSession();

  // DR-14: the shared hook owns the load; the optimistic decide/remove edits layer on top and are
  // dropped by a refetch.
  const feed = useFetchState(() => (account ? api.getReceivedApplications() : Promise.resolve(null)), [account]);
  const [groups, setGroups] = useOverride<ReceivedCallGroup[]>(feed.data?.groups ?? NO_GROUPS);
  const screen: Screen =
    feed.state === 'loading' ? 'loading' : feed.state === 'error' ? 'error' : groups.length === 0 ? 'empty' : 'ready';
  const [announce, setAnnounce] = useState('');
  const [selectedCallId, setSelectedCallId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  // MC-7 amendment: the applicant id whose optimistic remove failed (rolled back) — surfaces the alert.
  const [removeErrorId, setRemoveErrorId] = useState<string | null>(null);

  // Selected group — falls back to the first when the id hasn't been set / no longer exists. This
  // also preserves the active selection across a refetch (e.g. after an owner edit while the modal
  // is open) and falls back to the newest call when the selected one is gone (e.g. after a delete).
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

  // MC-7 amendment: owner removes an applicant. Optimistic drop; rollback + inline alert on failure.
  async function handleRemove(callId: string, app: ApplicationDto) {
    const snapshot = groups;
    setRemoveErrorId(null);
    setGroups((prev) =>
      prev.map((g) =>
        g.callId !== callId ? g : { ...g, applications: g.applications.filter((a) => a.id !== app.id) },
      ),
    );
    try {
      await api.removeApplicant(app.id);
      setAnnounce(`Candidature de ${app.applicant.name} retirée.`);
    } catch {
      setGroups(snapshot);
      setRemoveErrorId(app.id);
    }
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
              className="ep-btn-secondary"
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
                onRemove={() => void handleRemove(selected.callId, app)}
                removeError={removeErrorId === app.id}
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
              onChanged={feed.retry}
              onDeleted={() => {
                setDetailOpen(false);
                feed.retry();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
