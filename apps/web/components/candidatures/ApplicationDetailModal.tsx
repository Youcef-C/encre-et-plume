'use client';

// MC-6 amendment — "Voir" a submitted application. Read-only detail (all statuses): the full message
// text and every attached sample (image thumbnails opening in a new tab / PDF download links), fetched
// from GET /me/applications/:id (the list row omits the message). Reuses the shared modal shell
// (overlay, 3px ink border, hard offset shadow, focus trap, Esc/overlay close).
import { useEffect, useRef, useState } from 'react';
import type { MyApplicationRow } from '@encre-et-plume/shared';
import { getMyApplication } from '../../lib/api';
import { useScrollLock } from '../../lib/useScrollLock';
import { formatBytes } from '../../lib/format';
import StatusBadge from './StatusBadge';
import { XIcon } from '../icons';

function focusTrap(e: React.KeyboardEvent, dialogRef: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !dialogRef.current) return;
  const focusable = Array.from(
    dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink)',
  letterSpacing: '.03em',
  margin: '18px 0 8px',
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; app: MyApplicationRow }
  | { status: 'error' };

export default function ApplicationDetailModal({
  applicationId,
  callTitle,
  onClose,
}: {
  applicationId: string;
  callTitle: string;
  onClose: () => void;
}) {
  useScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'application-detail-title';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getMyApplication(applicationId)
      .then((app) => !cancelled && setState({ status: 'ready', app }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [applicationId, reloadKey]);

  const app = state.status === 'ready' ? state.app : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
            return;
          }
          focusTrap(e, dialogRef);
        }}
        style={{
          width: 560,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        {/* Header */}
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              id={titleId}
              style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase', lineHeight: 1 }}
            >
              Ma candidature
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>{callTitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Scrolling body — the header above stays pinned. */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto' }}>
        {state.status === 'loading' && (
          <div role="status" aria-label="Chargement de la candidature…" style={{ padding: 24 }}>
            <div className="ep-skeleton-delayed" style={{ height: 20, width: '50%', background: 'var(--tone)', borderRadius: 6, marginBottom: 12 }} />
            <div className="ep-skeleton-delayed" style={{ height: 90, background: 'var(--tone)', borderRadius: 8, opacity: 0.6 }} />
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" style={{ padding: 24 }}>
            <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 12 }}>
              Impossible de charger votre candidature.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="ep-btn-primary"
              style={{ fontSize: 13, border: '2px solid var(--ink)', padding: '8px 16px', fontFamily: 'inherit' }}
            >
              Réessayer
            </button>
          </div>
        )}

        {app && (
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={app.status} />
            </div>

            <div style={sectionLabel}>VOTRE MESSAGE</div>
            {app.message && app.message.trim() ? (
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {app.message}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>Aucun message.</p>
            )}

            {app.samples.length > 0 && (
              <>
                <div style={sectionLabel}>ÉCHANTILLONS</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {app.samples.map((s, i) =>
                    s.kind === 'image' ? (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" aria-label={`Voir l'échantillon ${i + 1}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt=""
                          width={90}
                          height={116}
                          style={{ width: 90, height: 116, objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 6, flex: 'none', display: 'block' }}
                        />
                      </a>
                    ) : (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ouvrir le document ${i + 1}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 12px', minHeight: 44, boxSizing: 'border-box', background: 'var(--card)', textDecoration: 'none' }}
                      >
                        PDF{s.size != null ? ` · ${formatBytes(s.size)}` : ''}
                      </a>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
