'use client';

// MC-13 (Inferred, reworked 2026-07-10) — the Comptoir presence roster. Presence = salon MEMBERSHIP
// (people who clicked "＋ Rejoindre le salon" until "Quitter"), persisting through widget-collapse and
// disconnect — NOT WS-room presence, NOT app-online.
//
// Trigger (user-specified): a small user-icon button that sits to the RIGHT of the dock, OUTSIDE the
// thread/widget area, carrying the member count as a badge. Clicking it toggles the roster — a right-side
// panel on wide screens, a bottom overlay-drawer on narrow (the `.ep-salon-roster-panel` class carries the
// responsive positioning). Open/closed state is remembered per session (sessionStorage).
//
// Data from GET /salon/presence, kept live off the shared MC-9 socket (salon:member:joined / :left). The
// count comes straight from the response (server already excludes self + blocked) and is nudged by the
// live deltas — no self re-filtering that would double-exclude it. Per-row actions via the shared
// OverflowMenu (Voir le profil / Envoyer un message / Bloquer).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  WS_EVENTS,
  SALON_NAME,
  type SalonRosterItem,
  type WsSalonMemberJoined,
  type WsSalonMemberLeft,
} from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMessaging } from '../../lib/messaging';
import OverflowMenu, { MenuItem } from '../OverflowMenu';
import BlockConfirmModal from '../blocks/BlockConfirmModal';
import { UsersIcon, XIcon } from '../icons';

const STORAGE_KEY = 'ep-salon-roster-open';
type RosterState = 'loading' | 'ready' | 'error';

function avatarDisc(url: string | null, size = 30): React.CSSProperties {
  return {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    display: 'block',
    background: url
      ? `center/cover url(${url})`
      : 'radial-gradient(var(--ink) 1.4px, transparent 1.5px) 0 0/7px 7px, var(--tone)',
  };
}

export default function SalonRoster({
  blockedIds,
  onBlocked,
  membershipVersion = 0,
}: {
  blockedIds: Set<string>;
  onBlocked: (userId: string) => void;
  // Bumped by SalonDock on the user's OWN Rejoindre/Quitter → re-fetch the authoritative presence
  // (count + list incl. the "· vous" self row). WS handles OTHER users; self is refetch-driven.
  membershipVersion?: number;
}) {
  const { account } = useSession();
  const { socket, openDm } = useMessaging();
  const router = useRouter();
  const myId = account?.id ?? null;

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<SalonRosterItem[]>([]);
  const [state, setState] = useState<RosterState>('loading');
  const [blocking, setBlocking] = useState<SalonRosterItem | null>(null);

  // Read inside stable socket handlers without re-subscribing.
  const myIdRef = useRef(myId);
  myIdRef.current = myId;
  const blockedRef = useRef(blockedIds);
  blockedRef.current = blockedIds;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Restore the remembered open/collapsed state (collapsed by default).
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') setOpen(true);
  }, []);

  const load = useCallback(() => {
    setState('loading');
    api
      .getSalonPresence()
      .then((res) => {
        setCount(res.count); // server value — count === items.length (self INCLUDED, blocked excluded)
        setItems(res.items);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  // Populate the count (badge) + list on mount, and re-fetch whenever the user's OWN membership
  // changes (membershipVersion bump) so the self "· vous" row + count are authoritative.
  useEffect(() => {
    load();
  }, [load, membershipVersion]);

  // Live roster: append joins / drop leaves symmetrically, keeping count === visible rows. No reload,
  // no polling. Skip the echo of my OWN id (I already count myself) and any blocked user; only mutate
  // count when a row actually changed, so a stray leave (e.g. a blocked user) can't drift the count.
  useEffect(() => {
    if (!socket) return;
    const onJoin = (payload: WsSalonMemberJoined) => {
      const u = payload.user;
      if (u.id === myIdRef.current || blockedRef.current.has(u.id)) return;
      if (itemsRef.current.some((x) => x.id === u.id)) return; // already present → no double count
      setItems((list) => [...list, { ...u, self: false }]);
      setCount((n) => n + 1);
    };
    const onLeave = (payload: WsSalonMemberLeft) => {
      if (payload.userId === myIdRef.current) return; // own leave is refetch-driven (symmetric with join)
      if (!itemsRef.current.some((x) => x.id === payload.userId)) return; // not shown → don't touch count
      setItems((list) => list.filter((x) => x.id !== payload.userId));
      setCount((n) => Math.max(0, n - 1));
    };
    socket.on(WS_EVENTS.salonMemberJoined, onJoin);
    socket.on(WS_EVENTS.salonMemberLeft, onLeave);
    return () => {
      socket.off(WS_EVENTS.salonMemberJoined, onJoin);
      socket.off(WS_EVENTS.salonMemberLeft, onLeave);
    };
  }, [socket]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_KEY, '0');
  }, []);

  const handleBlocked = useCallback(
    (userId: string) => {
      setItems((list) => list.filter((x) => x.id !== userId));
      setCount((n) => Math.max(0, n - 1));
      onBlocked(userId);
      setBlocking(null);
    },
    [onBlocked],
  );

  // Defensive client-side filter: a user blocked while the roster is open never renders (a live join
  // could race a block). The caller's own row (self:true) is kept and shown as "· vous".
  const visible = items.filter((u) => !blockedIds.has(u.id));
  const others = visible.filter((u) => !u.self);
  const badge = count > 99 ? '99+' : String(count);
  // aria-label deliberately omits "Le Comptoir" so it can't collide with the dock header button
  // (mc11 `getByRole('button', {name:/Le Comptoir/})`).
  const triggerLabel = `Voir les membres présents${state === 'ready' ? `, ${count} en ligne` : ''}`;

  // Collapsed → the user-icon button; open → the SAME slot morphs into the members list. Both are the
  // one toggle (labelled + aria-expanded), sitting to the right of the dock, outside the thread.
  if (!open) {
    return (
      <button
        type="button"
        className="ep-salon-roster-trigger"
        onClick={toggle}
        aria-expanded={false}
        aria-label={triggerLabel}
      >
        <UsersIcon size={20} />
        {state === 'ready' && count > 0 && (
          <span aria-hidden="true" className="ep-salon-roster-badge">
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
        <div
          className="ep-salon-roster-panel"
          role="region"
          aria-label={`Membres présents dans ${SALON_NAME}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderBottom: '2px solid var(--ink)', background: 'var(--paper)' }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--ink)' }}>
              <UsersIcon size={16} />
            </span>
            <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink)' }}>
              {count} en ligne dans {SALON_NAME}
            </b>
            <button
              type="button"
              onClick={close}
              aria-expanded={true}
              aria-label="Fermer la liste des membres"
              style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex', minWidth: 32, minHeight: 32, justifyContent: 'center', alignItems: 'center' }}
            >
              <XIcon size={16} />
            </button>
          </div>

          <div style={{ overflow: 'auto', flex: 1, background: 'var(--card)' }}>
            {state === 'loading' &&
              [0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="ep-skeleton-delayed"
                  style={{ display: 'block', margin: '10px 13px', height: 34, borderRadius: 8, background: 'var(--tone)', opacity: 0.5 }}
                />
              ))}

            {state === 'error' && (
              <div style={{ padding: '16px 13px', textAlign: 'center' }}>
                <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', margin: '0 0 10px' }}>
                  Impossible de charger la liste.
                </p>
                <button
                  type="button"
                  onClick={load}
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: 6, padding: '8px 16px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Réessayer
                </button>
              </div>
            )}

            {state === 'ready' && visible.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {visible.map((u) => (
                  <li key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px 7px 13px', borderBottom: '2px solid var(--border)', minHeight: 48 }}>
                    {u.self ? (
                      // Your own row: shown + flagged, but no actions (can't DM/block yourself).
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, color: 'var(--ink)' }}>
                        <span aria-hidden="true" style={avatarDisc(u.avatarUrl, 30)} />
                        <span style={{ minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.name}
                        </span>
                        <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>· vous</span>
                      </span>
                    ) : (
                      <>
                        <Link
                          href={`/${u.slug}`}
                          aria-label={`Voir le profil de ${u.name}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}
                        >
                          <span aria-hidden="true" style={avatarDisc(u.avatarUrl, 30)} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name}
                          </span>
                        </Link>
                        <OverflowMenu label={`Actions sur ${u.name}`} triggerStyle={{ fontSize: 15, minWidth: 40, minHeight: 40 }}>
                          {(dismiss) => (
                            <>
                              <MenuItem
                                onClick={() => {
                                  dismiss();
                                  router.push(`/${u.slug}`);
                                }}
                              >
                                Voir le profil
                              </MenuItem>
                              <MenuItem
                                onClick={() => {
                                  dismiss();
                                  void openDm(u.id);
                                }}
                              >
                                Envoyer un message
                              </MenuItem>
                              <MenuItem
                                accent
                                ariaLabel={`Bloquer ${u.name}`}
                                onClick={() => {
                                  dismiss();
                                  setBlocking(u);
                                }}
                              >
                                Bloquer
                              </MenuItem>
                            </>
                          )}
                        </OverflowMenu>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {state === 'ready' && others.length === 0 && (
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textAlign: 'center', padding: '18px 13px', margin: 0 }}>
                Personne d&apos;autre pour le moment
              </p>
            )}
          </div>
        </div>

      {blocking && (
        <BlockConfirmModal
          user={{ userId: blocking.id, name: blocking.name }}
          onClose={() => setBlocking(null)}
          onBlocked={() => handleBlocked(blocking.id)}
        />
      )}
    </>
  );
}
