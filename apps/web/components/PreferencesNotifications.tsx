'use client';

// F-15: "Préférences de notification" — 5-category × 2-channel matrix.
// Mandatory categories (account, moderation) are shown locked ("Toujours envoyé").
// Optimistic toggle: flip local state → PATCH → toast on success, revert on error.

import { useEffect, useRef, useState } from 'react';
import { NOTIFICATION_TYPES } from '@encre-et-plume/shared';
import type { NotificationPreferenceRow, NotificationChannel } from '@encre-et-plume/shared';
import { getNotificationPreferences, updateNotificationPreferences } from '../lib/api';
import OnBrandSwitch from './form/OnBrandSwitch';

type StatusMsg = { kind: 'success' | 'error'; text: string };

export default function PreferencesNotifications() {
  const [rows, setRows] = useState<NotificationPreferenceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getNotificationPreferences()
      .then((data) => setRows(data.preferences))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  function showStatus(msg: StatusMsg) {
    setStatus(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    // Clear success after 4s; keep error until next action
    if (msg.kind === 'success') {
      statusTimer.current = setTimeout(() => setStatus(null), 4000);
    }
  }

  async function handleToggle(row: NotificationPreferenceRow, channel: NotificationChannel) {
    if (!rows) return;
    const prev = rows;
    const updated = rows.map((r) =>
      r.type === row.type
        ? { ...r, inApp: channel === 'in_app' ? !r.inApp : r.inApp, email: channel === 'email' ? !r.email : r.email }
        : r,
    );
    // Optimistic update
    setRows(updated);
    setStatus(null);

    try {
      const newEnabled = channel === 'in_app' ? !row.inApp : !row.email;
      const result = await updateNotificationPreferences([{ type: row.type, channel, enabled: newEnabled }]);
      setRows(result.preferences);
      showStatus({ kind: 'success', text: 'Préférences enregistrées.' });
    } catch {
      // Revert
      setRows(prev);
      showStatus({ kind: 'error', text: 'Une erreur est survenue. Veuillez réessayer.' });
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" style={{ padding: '12px 0' }}>
        {NOTIFICATION_TYPES.map((m) => (
          <div
            key={m.type}
            className="ep-skeleton-delayed"
            aria-hidden="true"
            style={{
              height: 64,
              background: 'var(--tone)',
              borderRadius: 6,
              marginBottom: 12,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* aria-live region for toast announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {status?.text}
      </div>

      {/* Inline status / error notice */}
      {status && (
        <div
          role={status.kind === 'error' ? 'alert' : 'status'}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: status.kind === 'error' ? 'var(--accent)' : 'var(--ink)',
            background: status.kind === 'error' ? 'var(--accent-soft)' : 'var(--paper)',
            border: `1.5px solid ${status.kind === 'error' ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 16,
          }}
        >
          {status.text}
        </div>
      )}

      {/* Channel header row — only on larger screens (handled by column layout) */}
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '0 24px',
          paddingBottom: 8,
          borderBottom: '1.5px solid var(--border)',
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink2)',
        }}
        className="ep-pref-header"
      >
        <span>Catégorie</span>
        <span style={{ minWidth: 80, textAlign: 'center' }}>Dans l&apos;app</span>
        <span style={{ minWidth: 80, textAlign: 'center' }}>E-mail</span>
      </div>

      {NOTIFICATION_TYPES.map((meta) => {
        const row = rows?.find((r) => r.type === meta.type);
        const inApp = row?.inApp ?? meta.defaultInApp;
        const email = row?.email ?? meta.defaultEmail;

        return (
          <fieldset
            key={meta.type}
            style={{
              border: 'none',
              padding: 0,
              margin: '0 0 4px',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '0 24px',
              alignItems: 'center',
              minHeight: 48,
              borderBottom: '1px solid var(--tone)',
            }}
            className="ep-pref-row"
          >
            <legend
              style={{
                float: 'left',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
                padding: '10px 0',
                lineHeight: 1.3,
              }}
            >
              {meta.group}
            </legend>

            {meta.mandatory ? (
              <>
                {/* Spacer to hold column alignment */}
                <span style={{ minWidth: 80, textAlign: 'center' }} />
                <span
                  style={{
                    minWidth: 80,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink2)',
                    padding: '10px 0',
                  }}
                >
                  Toujours envoyé
                </span>
              </>
            ) : (
              <>
                {/* Dans l'app toggle */}
                <Switch
                  id={`${meta.type}-inapp`}
                  label={`${meta.group} — Dans l'app`}
                  checked={inApp}
                  onToggle={() => void handleToggle(row ?? { type: meta.type, group: meta.group, mandatory: false, inApp, email }, 'in_app')}
                />
                {/* E-mail toggle */}
                <Switch
                  id={`${meta.type}-email`}
                  label={`${meta.group} — E-mail`}
                  checked={email}
                  onToggle={() => void handleToggle(row ?? { type: meta.type, group: meta.group, mandatory: false, inApp, email }, 'email')}
                />
              </>
            )}
          </fieldset>
        );
      })}

      <style>{`
        @media (max-width: 480px) {
          .ep-pref-header { display: none; }
          .ep-pref-row {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 8px 0;
          }
          .ep-pref-row legend { padding: 0; }
          .ep-pref-switch-wrap { min-width: unset; justify-content: flex-start; gap: 8px; }
        }
      `}</style>
    </div>
  );
}

// ─── Switch sub-component ─────────────────────────────────────────────────────

function Switch({ id, label, checked, onToggle }: { id: string; label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        minWidth: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px 0',
      }}
      className="ep-pref-switch-wrap"
    >
      {/* The shared control (user, 2026-08-01): accent-red when on, compact track. The column
          heading already names it on screen, so only the accessible name is carried here. */}
      <OnBrandSwitch id={id} label={label} checked={checked} onChange={onToggle} hideLabel />
    </div>
  );
}
