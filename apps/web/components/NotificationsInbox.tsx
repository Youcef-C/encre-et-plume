'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationItem } from '@encre-et-plume/shared';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api';
import { useUnreadCounts } from '../lib/unread';
import { NOTIF_LABEL, NOTIF_ICON, notificationHref, relativeTime } from '../lib/notifications';

// ─── Loading skeleton ────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div role="status" aria-label="Chargement des notifications" className="ep-skeleton-delayed" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 64,
            borderRadius: 10,
            border: '3px solid var(--border)',
            background: 'var(--card)',
            opacity: 0.5 + i * 0.1,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.45}50%{opacity:.7}}`}</style>
    </div>
  );
}

// ─── Single notification item ────────────────────────────────────────────────
function NotifItem({
  item,
  onRead,
}: {
  item: NotificationItem;
  onRead: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const isUnread = item.readAt === null;
  const sourceName = item.sourceUser?.displayName ?? 'Quelqu\'un';
  const label = NOTIF_LABEL[item.type](sourceName);
  const href = notificationHref(item.type, item.refId);

  async function handleClick() {
    if (isUnread) await onRead(item.id);
    router.push(href);
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        background: isUnread ? 'var(--card)' : 'transparent',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        padding: '11px 14px',
        boxShadow: isUnread ? '3px 3px 0 var(--shadow)' : 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = isUnread ? 'var(--card)' : 'transparent';
      }}
    >
      {/* Source avatar placeholder */}
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid var(--ink)',
          background: 'var(--tone)',
          backgroundImage: 'radial-gradient(var(--ink) 1.1px, transparent 1.2px)',
          backgroundSize: '4px 4px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        {NOTIF_ICON[item.type]}
      </span>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isUnread ? 700 : 400,
            color: 'var(--ink)',
            lineHeight: 1.4,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>
          {relativeTime(item.createdAt)}
        </div>
      </div>

      {/* Unread indicator dot */}
      {isUnread && (
        <span
          data-testid={`unread-dot-${item.id}`}
          aria-hidden="true"
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}

// ─── Main inbox component ────────────────────────────────────────────────────
export default function NotificationsInbox() {
  const { counts, refresh } = useUnreadCounts();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getNotifications()
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = items?.filter((n) => n.readAt === null).length ?? 0;

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setItems((prev) =>
      prev?.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) ?? null
    );
    refresh();
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null
      );
      refresh();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '28px 28px 80px',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            textTransform: 'uppercase',
            margin: 0,
            lineHeight: 1,
          }}
        >
          Notifications
        </h1>

        {/* New count pill — driven by UnreadCountsContext.total */}
        {counts.total > 0 && (
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
            {counts.total} nouvelles
          </span>
        )}

        {/* Tout marquer comme lu */}
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={unreadCount === 0 || markingAll}
          style={{
            marginLeft: 'auto',
            fontSize: 13,
            fontWeight: 700,
            color: unreadCount === 0 ? 'var(--ink2)' : 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: unreadCount === 0 ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)',
            padding: 0,
          }}
        >
          Tout marquer comme lu
        </button>
      </div>

      <div
        style={{
          fontSize: 15,
          color: 'var(--ink2)',
          fontWeight: 500,
          marginBottom: 20,
        }}
      >
        Vos invitations, sorties et réactions récentes.
      </div>

      {/* Body */}
      {items === null && !error ? (
        <Skeleton />
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: '20px 16px',
            border: '3px solid var(--accent)',
            borderRadius: 10,
            background: 'var(--accent-soft)',
            color: 'var(--ink)',
            fontWeight: 700,
          }}
        >
          Une erreur est survenue. Veuillez réessayer.
        </div>
      ) : items!.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            color: 'var(--ink2)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>✉</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Aucune notification</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Vos invitations et activités apparaîtront ici.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items!.map((item) => (
            <NotifItem key={item.id} item={item} onRead={handleMarkRead} />
          ))}
        </div>
      )}
    </div>
  );
}
