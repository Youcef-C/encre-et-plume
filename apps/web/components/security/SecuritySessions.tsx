'use client';

// F-18: Security block — active sessions list with per-row revoke and "revoke others" confirm.

import { useEffect, useRef, useState } from 'react';
import { getSessions, revokeSession, revokeOtherSessions } from '../../lib/api';
import type { SessionSummary } from '@encre-et-plume/shared';
import type { ApiError } from '@encre-et-plume/shared';

// ponytail: simple UA → browser name; no UA-parser lib
function parseDevice(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Navigateur';
}

// ponytail: no dayjs/date-fns — simple relative time
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

// Reuse focus-trap pattern from SupprimerCompteModal
function trapFocus(e: React.KeyboardEvent, ref: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !ref.current) return;
  const els = Array.from(
    ref.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

export default function SecuritySessions() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [revokeOthersLoading, setRevokeOthersLoading] = useState(false);

  const triggerOthersRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await getSessions();
      setSessions(data.sessions);
    } catch (err) {
      const apiErr = err as ApiError;
      setLoadError(apiErr.message ?? 'Impossible de charger les sessions.');
    }
  };

  useEffect(() => { void load(); }, []);

  // Focus first button when dialog opens
  useEffect(() => {
    if (confirmOthers) {
      // give DOM a tick to render
      requestAnimationFrame(() => {
        dialogRef.current
          ?.querySelector<HTMLElement>('button')
          ?.focus();
      });
    } else {
      triggerOthersRef.current?.focus();
    }
  }, [confirmOthers]);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await revokeSession(id);
      await load();
    } catch {
      // best-effort; reload anyway to show current state
      await load();
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokeOthersLoading(true);
    try {
      await revokeOtherSessions();
      setConfirmOthers(false);
      await load();
    } catch {
      await load();
    } finally {
      setRevokeOthersLoading(false);
    }
  };

  if (!sessions && !loadError) {
    return (
      <div aria-busy="true">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="ep-skeleton-delayed"
            aria-hidden="true"
            style={{
              height: 60,
              background: 'var(--tone)',
              borderRadius: 6,
              marginBottom: 10,
            }}
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <p role="alert" className="ep-error">
        {loadError}
      </p>
    );
  }

  const otherSessions = (sessions ?? []).filter((s) => !s.current);

  return (
    <div>
      {/* Session list */}
      {sessions && sessions.length === 0 && (
        <p style={{ color: 'var(--ink2)', fontSize: 14 }}>Aucune session active.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
        {(sessions ?? []).map((s) => (
          <li
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 0',
              borderBottom: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {parseDevice(s.userAgent)}
                </span>
                {s.current && (
                  <span
                    style={{
                      background: 'var(--ink)',
                      color: 'var(--card)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Session actuelle
                  </span>
                )}
              </div>
              {s.ip && (
                <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--ink2)' }}>
                  {s.ip}
                </p>
              )}
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink2)' }}>
                Dernière activité : {relativeTime(s.lastSeenAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRevoke(s.id)}
              disabled={s.current || revoking === s.id}
              className="ep-btn-secondary"
              style={{ fontSize: 13, padding: '8px 14px', minHeight: 44 }}
              aria-label={`Déconnecter la session ${parseDevice(s.userAgent)}`}
            >
              {revoking === s.id ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </li>
        ))}
      </ul>

      {/* Global revoke others */}
      {otherSessions.length > 0 && (
        <button
          ref={triggerOthersRef}
          type="button"
          onClick={() => setConfirmOthers(true)}
          className="ep-btn-secondary"
          style={{ fontSize: 14, padding: '10px 16px', minHeight: 44 }}
        >
          Déconnecter toutes les autres sessions
        </button>
      )}

      {/* Confirm dialog */}
      {confirmOthers && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setConfirmOthers(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(22,19,15,0.65)',
              zIndex: 60,
            }}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-others-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirmOthers(false);
              trapFocus(e, dialogRef);
            }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 61,
              width: 'min(440px, calc(100vw - 32px))',
              background: 'var(--card)',
              border: '3px solid var(--ink)',
              borderRadius: 8,
              boxShadow: '6px 6px 0 var(--shadow)',
              padding: '28px 32px',
            }}
          >
            <h2
              id="revoke-others-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                margin: '0 0 14px',
                color: 'var(--ink)',
              }}
            >
              Déconnecter les autres sessions
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 24px' }}>
              Toutes vos autres sessions actives seront déconnectées. Votre session actuelle
              reste active.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ep-btn-primary"
                onClick={() => void handleRevokeOthers()}
                disabled={revokeOthersLoading}
                style={{ flex: 1, fontSize: 14 }}
              >
                {revokeOthersLoading ? 'Déconnexion…' : 'Confirmer'}
              </button>
              <button
                type="button"
                className="ep-btn-secondary"
                onClick={() => setConfirmOthers(false)}
                disabled={revokeOthersLoading}
                style={{ flex: 1, fontSize: 14 }}
              >
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
