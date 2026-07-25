'use client';

// MC-11 — Community salon "Le Comptoir": a collapsible dock fixed bottom-left (the MC-9 Messages
// widget stays bottom-right). Replica of the prototype's `SALON — DOCK COLLAPSABLE` section.
// Reuses the shared MC-9 socket (via useMessaging().socket) — no second WS connection.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WS_EVENTS,
  SALON_NAME,
  type SalonMessageDto,
  type SalonOnlineUser,
  type WsSalonMessage,
  type WsSalonMemberJoined,
  type WsSalonMemberLeft,
} from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMessaging } from '../../lib/messaging';
import { ChatIcon } from '../icons';
import SalonRoster from './SalonRoster';

// Optimistic / failed local send state layered on the DTO (same shape idea as MC-9).
type FeedMessage = SalonMessageDto & { pending?: boolean; failed?: boolean; error?: string };
type FeedState = 'idle' | 'loading' | 'ready' | 'error';

// Dedupe by id — the server echoes my own send back over the socket. If the echo races the
// optimistic bubble's own id (temp id ≠ real id), reconcile it against a pending optimistic of the
// same sender + body instead of appending a second bubble.
function merge(list: FeedMessage[], m: FeedMessage): FeedMessage[] {
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = m;
    return next;
  }
  const pending = list.findIndex((x) => x.pending && x.senderId === m.senderId && x.body === m.body);
  if (pending >= 0) {
    const next = [...list];
    next[pending] = m;
    return next;
  }
  return [...list, m];
}

export default function SalonDock() {
  const { account } = useSession();
  const { socket, connectionState } = useMessaging();
  const myId = account?.id ?? null;

  const [expanded, setExpanded] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  // Bumped on the user's OWN Rejoindre/Quitter → signals SalonRoster to re-fetch its presence.
  const [membershipVersion, setMembershipVersion] = useState(0);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [feedState, setFeedState] = useState<FeedState>('idle');
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  // @-mention impact (MC-11 addendum): flashed bubbles, a jump pill when scrolled away, and a
  // distinct collapsed-header indicator. All realtime/client-side off the shared MC-9 socket.
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set()); // bubbles to flash
  const [mentionPending, setMentionPending] = useState<string | null>(null); // off-screen mention → jump pill
  const [mentionCollapsed, setMentionCollapsed] = useState(false); // collapsed-header @ indicator
  const [atBottom, setAtBottom] = useState(true); // mirrors pinnedRef for rendering the scroll-to-newest button

  // @-mention autocomplete
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<SalonOnlineUser[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pinnedRef = useRef(true); // is the feed scrolled to the bottom?
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const blockedRef = useRef(blockedIds);
  blockedRef.current = blockedIds;
  const memberRef = useRef(false);
  memberRef.current = isMember;
  // Read inside the socket handler (whose effect deps stay [socket, myId]) without re-subscribing.
  const nameRef = useRef<string | null>(null);
  nameRef.current = account?.displayName ?? null;
  const connectedRef = useRef(false);
  connectedRef.current = connectionState === 'connected';

  // ── Initial load: summary + my blocks (blocks on mount so collapsed unread counting respects MC-10). ──
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    api
      .getSalon()
      .then((s) => {
        if (!alive) return;
        setIsMember(s.isMember);
        setOnlineCount(s.onlineCount);
        setUnread(s.unreadCount);
      })
      .catch(() => {});
    api
      .getMyBlocks()
      .then((r) => {
        if (alive) setBlockedIds(new Set(r.items.map((b) => b.userId)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [myId]);

  const markReadIfMember = useCallback(() => {
    setUnread(0);
    if (memberRef.current) void api.markSalonRead().catch(() => {});
  }, []);

  // ── Realtime: subscribe to the shared socket; re-runs when the socket instance changes. ──
  useEffect(() => {
    if (!socket) return;
    const onMessage = (payload: WsSalonMessage) => {
      const m = payload.message;
      if (blockedRef.current.has(m.senderId)) return; // MC-10: hide + don't count
      setMessages((list) => merge(list, m));
      if (m.senderId === myId) return; // my own echo never bumps unread (nor counts as mentioning me)
      // Mention of me? Whole-name substring — pickMention inserts exactly "@<name> " (spec).
      const name = nameRef.current;
      const mention = !!name && m.body.toLowerCase().includes('@' + name.toLowerCase());
      if (mention) setMentionIds((s) => new Set(s).add(m.id));
      if (!expandedRef.current) {
        setUnread((n) => n + 1);
        if (mention && connectedRef.current) setMentionCollapsed(true);
      } else if (pinnedRef.current) {
        requestAnimationFrame(() => {
          const el = feedRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
        if (memberRef.current) void api.markSalonRead().catch(() => {});
      } else if (mention) {
        // Expanded but scrolled up → the new mention is below the fold: offer a jump pill.
        setMentionPending(m.id);
      }
    };
    // MC-13: the header "N en ligne" is the Comptoir MEMBERSHIP count (repointed server-side to match
    // the roster) — NOT the separate app-online salonPresence event. Keep it live off the same
    // membership deltas the roster uses, skipping self + blocked so it stays consistent with the list.
    const onMemberJoined = (payload: WsSalonMemberJoined) => {
      const u = payload.user;
      if (u.id === myId || blockedRef.current.has(u.id)) return;
      setOnlineCount((n) => n + 1);
    };
    const onMemberLeft = (payload: WsSalonMemberLeft) => {
      if (payload.userId === myId) return; // own leave is refetch-driven (symmetric with join)
      if (blockedRef.current.has(payload.userId)) return; // a blocked user was never counted → don't decrement
      setOnlineCount((n) => Math.max(0, n - 1));
    };
    socket.on(WS_EVENTS.salonMessage, onMessage);
    socket.on(WS_EVENTS.salonMemberJoined, onMemberJoined);
    socket.on(WS_EVENTS.salonMemberLeft, onMemberLeft);
    return () => {
      socket.off(WS_EVENTS.salonMessage, onMessage);
      socket.off(WS_EVENTS.salonMemberJoined, onMemberJoined);
      socket.off(WS_EVENTS.salonMemberLeft, onMemberLeft);
    };
  }, [socket, myId]);

  const loadHistory = useCallback(() => {
    setFeedState('loading');
    api
      .getSalonMessages()
      .then((page) => {
        setMessages([...page.items].reverse()); // API newest-first → display oldest→newest
        setLoaded(true);
        setFeedState('ready');
        requestAnimationFrame(() => {
          const el = feedRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      })
      .catch(() => setFeedState('error'));
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        if (!loaded) loadHistory();
        markReadIfMember();
        setMentionCollapsed(false); // opening the dock clears the collapsed @ indicator
      }
      return next;
    });
  }, [loaded, loadHistory, markReadIfMember]);

  // Jump the feed to the newest message; also settles the mention pill / scroll-to-newest button.
  const scrollToNewest = useCallback(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setAtBottom(true);
    setMentionPending(null);
  }, []);

  // Own membership change: refetch the authoritative membership count for the header and bump
  // membershipVersion so SalonRoster re-fetches its {count, items} (gains/loses the "· vous" row).
  const refetchOwnMembership = useCallback(() => {
    setMembershipVersion((v) => v + 1);
    api
      .getSalon()
      .then((s) => setOnlineCount(s.onlineCount))
      .catch(() => {});
  }, []);

  const join = useCallback(async () => {
    try {
      const r = await api.joinSalon();
      setIsMember(r.isMember);
      refetchOwnMembership();
    } catch {
      /* stays on the join panel */
    }
  }, [refetchOwnMembership]);

  const leave = useCallback(async () => {
    try {
      const r = await api.leaveSalon();
      setIsMember(r.isMember);
      refetchOwnMembership();
    } catch {
      /* stays on the composer */
    }
  }, [refetchOwnMembership]);

  // ── Sending (optimistic, with retry on failure) ──
  const doSend = useCallback(
    async (tempId: string, body: string) => {
      try {
        const real = await api.sendSalonMessage(body);
        setMessages((list) => merge(list.filter((m) => m.id !== tempId), real));
      } catch (e) {
        const error = (e as { message?: string } | null)?.message;
        setMessages((list) =>
          list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, error } : m)),
        );
      }
    },
    [],
  );

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((list) => [
      ...list,
      {
        id: tempId,
        senderId: myId ?? '',
        senderName: account?.displayName ?? 'Vous',
        body,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    setDraft('');
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const el = feedRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    void doSend(tempId, body);
  }, [draft, myId, account?.displayName, doSend]);

  const retry = useCallback(
    (m: FeedMessage) => {
      setMessages((list) =>
        list.map((x) => (x.id === m.id ? { ...x, failed: false, error: undefined, pending: true } : x)),
      );
      void doSend(m.id, m.body);
    },
    [doSend],
  );

  // ── @-mention: open a listbox of online users when the caret follows an "@" token. ──
  const updateMention = useCallback((value: string, caret: number) => {
    const upToCaret = value.slice(0, caret);
    const at = upToCaret.lastIndexOf('@');
    const token = at >= 0 ? upToCaret.slice(at + 1) : '';
    const valid = at >= 0 && !/\s/.test(token);
    if (valid) {
      setMentionQuery(token);
      setActiveIdx(0);
      setMentionOpen((open) => {
        if (!open) {
          api
            .getSalonOnline()
            .then((r) => setOnlineUsers(r.items.filter((u) => u.userId !== myId)))
            .catch(() => setOnlineUsers([]));
        }
        return true;
      });
    } else {
      setMentionOpen(false);
    }
  }, [myId]);

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return onlineUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [onlineUsers, mentionQuery]);

  const pickMention = useCallback(
    (user: SalonOnlineUser) => {
      const el = inputRef.current;
      const caret = el ? el.selectionStart ?? draft.length : draft.length;
      const before = draft.slice(0, caret);
      const at = before.lastIndexOf('@');
      const head = at >= 0 ? draft.slice(0, at) : draft;
      const tail = draft.slice(caret);
      setDraft(`${head}@${user.name} ${tail}`);
      setMentionOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [draft],
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionOpen && filteredMentions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % filteredMentions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          pickMention(filteredMentions[activeIdx]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        send();
      }
    },
    [mentionOpen, filteredMentions, activeIdx, pickMention, send],
  );

  if (!myId) return null;

  const visible = messages.filter((m) => !blockedIds.has(m.senderId));
  const hasUnread = unread > 0;
  const connected = connectionState === 'connected';
  // "Connecté" = joined the Comptoir channel AND the realtime link is live — not merely logged in.
  const atComptoir = isMember && connected;
  const ink = '#16130f';
  const paper = '#f1ece1';

  return (
    // Flex cluster: the dock + the roster's user-icon trigger sit side by side, bottom-left. The trigger
    // is 8px to the RIGHT of the dock (outside the thread) and follows the dock's width with no jump.
    <div className="ep-salon-dock-cluster">
    <div
      className="ep-salon-dock"
      style={{
        // Collapsed, the Comptoir hugs its content (just "Le Comptoir" + "N en ligne"); it
        // expands to the full 400 panel when opened.
        width: expanded ? 400 : 'fit-content',
        maxWidth: '100%',
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '6px 6px 0 var(--shadow)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        data-unread={hasUnread ? 'yes' : 'no'}
        aria-label={`${SALON_NAME}, ${
          hasUnread ? `${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}` : 'aucun message non lu'
        }${mentionCollapsed ? ', vous avez été mentionné·e' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '11px 13px',
          background: hasUnread ? 'var(--accent)' : ink,
          color: paper,
          cursor: 'pointer',
          border: 'none',
          textAlign: 'left',
          fontFamily: 'inherit',
          minHeight: 44,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--accent)',
            border: `2px solid ${paper}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flex: 'none',
          }}
        >
          <ChatIcon size={17} />
          {hasUnread && (
            <span
              style={{
                position: 'absolute',
                top: -7,
                right: -7,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: '#fff',
                color: 'var(--accent)',
                border: '2px solid var(--ink)',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
              }}
            >
              {unread}
            </span>
          )}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14, display: 'block' }}>{SALON_NAME}</b>
          <span data-connected={atComptoir ? 'yes' : 'no'} style={{ fontSize: 11, color: '#cabfb2', display: 'block' }}>
            {/* Green presence dot lights up when connected to the salon realtime; muted while reconnecting.
                The "Connecté" state is shown by the dot colour alone — no text label. */}
            <span style={{ color: atComptoir ? '#3ecf8e' : '#8a8178' }} aria-hidden="true">
              ●
            </span>{' '}
            {onlineCount} en ligne
          </span>
        </span>
        {mentionCollapsed && (
          // Distinct from the generic unread count: you specifically were @-mentioned.
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid #fff',
              borderRadius: 5,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            @ Mention
          </span>
        )}
        {hasUnread && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: '#fff',
              color: 'var(--accent)',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {unread} nouveau·x
          </span>
        )}
        <span aria-hidden="true" style={{ fontSize: 16, color: '#cabfb2' }}>
          {expanded ? '▾' : '▴'}
        </span>
      </button>

      {expanded && (
        <div>
          {connectionState === 'reconnecting' && (
            <div
              role="status"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--ink2)',
                background: 'var(--paper)',
                borderBottom: '2px solid var(--ink)',
                padding: '6px 13px',
                textAlign: 'center',
              }}
            >
              Reconnexion…
            </div>
          )}

          <div style={{ position: 'relative' }}>
          <div
            ref={feedRef}
            role="log"
            aria-live="polite"
            aria-label={SALON_NAME}
            onScroll={(e) => {
              const el = e.currentTarget;
              const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
              pinnedRef.current = pinned;
              setAtBottom(pinned);
              if (pinned) setMentionPending(null); // scrolled the mention into view
            }}
            style={{
              height: 280,
              overflow: 'auto',
              padding: '13px 15px',
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              background: 'var(--paper)',
            }}
          >
            {feedState === 'loading' &&
              [0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="ep-skeleton-delayed"
                  style={{ alignSelf: 'flex-start', width: '70%', height: 44, borderRadius: 10, background: 'var(--tone)', opacity: 0.5 }}
                />
              ))}

            {feedState === 'error' && (
              <p role="alert" style={{ margin: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--accent)', textAlign: 'center' }}>
                Impossible de charger les messages.
              </p>
            )}

            {feedState === 'ready' && visible.length === 0 && (
              <p style={{ margin: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>Soyez le premier à écrire.</p>
            )}

            {feedState === 'ready' &&
              visible.map((m) => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: m.pending ? 0.6 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', padding: '0 4px' }}>{m.senderName}</div>
                  <div
                    className={mentionIds.has(m.id) ? 'ep-mention-flash' : undefined}
                    style={{
                      alignSelf: 'flex-start',
                      maxWidth: '82%',
                      fontSize: 14,
                      lineHeight: 1.45,
                      border: '2px solid var(--ink)',
                      borderRadius: 10,
                      padding: '7px 11px',
                      background: 'var(--card)',
                      color: 'var(--ink)',
                    }}
                  >
                    {m.body}
                  </div>
                  {m.failed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
                      <span role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                        {"Échec de l'envoi"}
                      </span>
                      <button
                        type="button"
                        onClick={() => retry(m)}
                        style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', border: '2px solid var(--accent)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Réessayer
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>

          {/* Feed affordances (mutually exclusive so they never overlap): a pending off-screen
              mention takes priority; otherwise the plain scroll-to-newest when scrolled up. */}
          {mentionPending ? (
            <button
              type="button"
              onClick={scrollToNewest}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 12,
                transform: 'translateX(-50%)',
                zIndex: 1,
                fontSize: 12.5,
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#fff',
                border: '2px solid var(--ink)',
                borderRadius: 999,
                padding: '9px 16px',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 var(--shadow)',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                minHeight: 40,
              }}
            >
              ↓ Nouvelle mention
            </button>
          ) : !atBottom ? (
            <button
              type="button"
              onClick={scrollToNewest}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 12,
                transform: 'translateX(-50%)',
                zIndex: 1,
                fontSize: 12.5,
                fontWeight: 700,
                background: 'var(--card)',
                color: 'var(--ink)',
                border: '2px solid var(--ink)',
                borderRadius: 999,
                padding: '9px 16px',
                cursor: 'pointer',
                boxShadow: '2px 2px 0 var(--shadow)',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
                minHeight: 40,
              }}
            >
              ↓ Aller au plus récent
            </button>
          ) : null}
          </div>

          {!isMember ? (
            <div style={{ padding: '14px 15px', borderTop: '3px solid var(--ink)', textAlign: 'center', background: 'var(--card)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 10 }}>
                Rejoignez <b style={{ color: 'var(--ink)' }}>Le Comptoir</b> pour discuter avec la communauté.
              </div>
              <button
                type="button"
                onClick={join}
                className="ep-btn-primary"
                style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 22px', cursor: 'pointer', boxShadow: '3px 3px 0 var(--shadow)', fontFamily: 'inherit', minHeight: 44 }}
              >
                ＋ Rejoindre le salon
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderTop: '3px solid var(--ink)', background: 'var(--card)' }}>
              {mentionOpen && (
                <ul
                  id="salon-mention-listbox"
                  role="listbox"
                  aria-label="Membres en ligne"
                  style={{
                    position: 'absolute',
                    left: 13,
                    right: 13,
                    bottom: 'calc(100% + 4px)',
                    maxHeight: 168,
                    overflow: 'auto',
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    background: 'var(--card)',
                    border: '3px solid var(--ink)',
                    borderRadius: 10,
                    boxShadow: '4px 4px 0 var(--shadow)',
                    zIndex: 2,
                  }}
                >
                  {filteredMentions.length === 0 ? (
                    <li style={{ fontSize: 13, color: 'var(--ink2)', padding: '8px 11px' }}>Personne d&apos;autre en ligne</li>
                  ) : (
                    filteredMentions.map((u, i) => (
                      <li
                        key={u.userId}
                        role="option"
                        id={`salon-mention-${u.userId}`}
                        aria-selected={i === activeIdx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(u);
                        }}
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          padding: '8px 11px',
                          cursor: 'pointer',
                          color: i === activeIdx ? '#fff' : 'var(--ink)',
                          background: i === activeIdx ? 'var(--accent)' : 'transparent',
                        }}
                      >
                        {u.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
              <input
                ref={inputRef}
                value={draft}
                role="combobox"
                aria-label="Votre message"
                aria-autocomplete="list"
                aria-controls="salon-mention-listbox"
                aria-expanded={mentionOpen}
                aria-activedescendant={mentionOpen && filteredMentions[activeIdx] ? `salon-mention-${filteredMentions[activeIdx].userId}` : undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Votre message…"
                style={{ flex: 1, minWidth: 0, border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box', outline: 'none' }}
              />
              <button
                type="button"
                onClick={send}
                className="ep-btn-primary"
                style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 15px', cursor: 'pointer', boxShadow: '2px 2px 0 var(--shadow)', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 44 }}
              >
                Envoyer
              </button>
              <button
                type="button"
                onClick={leave}
                title="Quitter le salon"
                className="ep-salon-leave ep-btn-danger-outline"
                style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: 44 }}
              >
                Quitter
              </button>
            </div>
          )}
        </div>
      )}
    </div>

      {/* MC-13 — Comptoir roster: a user-icon button to the right of the dock (outside the thread)
          toggling the members list. Shown only when the dock is UNFOLDED (hidden while collapsed). */}
      {expanded && (
        <SalonRoster
          blockedIds={blockedIds}
          onBlocked={(userId) => {
            setBlockedIds((prev) => new Set(prev).add(userId));
            // Blocking a present member drops them from the roster count; re-sync the header count to the
            // server (identical behavior to the roster) so header === roster stays true.
            refetchOwnMembership();
          }}
          membershipVersion={membershipVersion}
        />
      )}
    </div>
  );
}
