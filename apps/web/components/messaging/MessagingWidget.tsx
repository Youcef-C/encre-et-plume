'use client';

// MC-9 — floating chat widget. Faithful replica of the prototype FLOATING CHAT MODULE section
// (.dc.html lines 2987–3036): FAB launcher with unread badge, panel with a dark header, conversation
// list (group chip / typing / preview rows), thread view (own/other bubbles, attachment tiles, typing
// line, "Lu"), and the composer. Deviations D2 (search field), D5 (MailIcon vs ✉) per plan. The
// prototype's minimize ▁ (ex-D1) is intentionally dropped — MC-9 amendment (2026-07-10): "Fermer" (X)
// already collapses to the FAB. On-brand: SVG icons, tokens, no emojis. State + realtime in lib/messaging.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConversationItem, ConversationParticipantDto } from '@encre-et-plume/shared';
import {
  UPLOAD_ALLOWED_CONTENT_TYPES,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  MESSAGE_MAX_ATTACHMENTS,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { useMessaging, type ThreadMessage } from '../../lib/messaging';
import { getMediaSignedUrl, getPresence, requestUpload, finalizeMedia, getMedia, getMyBlocks, deleteBlock } from '../../lib/api';
import { MailIcon, XIcon, ChevronLeftIcon, PlusIcon, GearIcon } from '../icons';
import GroupCreateModal from './GroupCreateModal';
import GroupMembersPanel from './GroupMembersPanel';
import OverflowMenu, { MenuItem } from '../OverflowMenu';
import BlockConfirmModal from '../blocks/BlockConfirmModal';

// Attachments accept the F-10 `attachment` allowlist (raster images ∪ PDF/TXT); the server re-validates.
const ATTACHMENT_ACCEPT = [...UPLOAD_ALLOWED_CONTENT_TYPES, ...DOCUMENT_ALLOWED_CONTENT_TYPES].join(',');
const ATTACHMENT_TYPES = new Set<string>([...UPLOAD_ALLOWED_CONTENT_TYPES, ...DOCUMENT_ALLOWED_CONTENT_TYPES]);
const UPLOAD_POLL_MAX = 60; // ~60s ceiling; images run the sharp pipeline after finalize

// F-10 private-upload flow (same presign → PUT → finalize → poll sequence as UploadControl), reduced
// to just resolving a ready mediaId — the composer shows a chip, not a progress bar.
async function uploadAttachment(file: File): Promise<string> {
  const { mediaId, uploadUrl } = await requestUpload({
    kind: 'attachment',
    visibility: 'private',
    contentType: file.type,
    size: file.size,
  });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  await finalizeMedia(mediaId);
  for (let attempt = 0; attempt < UPLOAD_POLL_MAX; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
    const m = await getMedia(mediaId);
    if (m.status === 'ready') return mediaId;
    if (m.status === 'failed') throw new Error('processing failed');
  }
  throw new Error('upload timeout');
}

// ─── shared bits ────────────────────────────────────────────────────────────────

const singleDisc = (url: string | null): React.CSSProperties => ({
  width: 34,
  height: 34,
  flex: 'none',
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  display: 'block',
  background: url ? `center/cover url(${url})` : 'var(--tone)',
});

// Two overlapped halftone circles = the "group chip" (prototype group row).
function GroupChip({ size = 34 }: { size?: number }) {
  const dot = Math.round(size * 0.68);
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <span style={{ position: 'absolute', top: 0, left: 0, width: dot, height: dot, borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--tone)' }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: dot, height: dot, borderRadius: '50%', border: '2px solid var(--ink)', background: 'var(--tone)' }} />
    </span>
  );
}

function otherParticipants(conv: ConversationItem, myId: string | null): ConversationParticipantDto[] {
  return conv.participants.filter((p) => p.userId !== myId);
}

// ─── conversation list row ──────────────────────────────────────────────────────

function ConversationRow({
  conv,
  isTyping,
  onOpen,
  myId,
}: {
  conv: ConversationItem;
  isTyping: boolean;
  onOpen: () => void;
  myId: string | null;
}) {
  const others = otherParticipants(conv, myId);
  const avatarUrl = conv.type === 'dm' ? others[0]?.avatarUrl ?? null : null;
  const preview = conv.lastMessage
    ? conv.type === 'group'
      ? `${conv.lastMessage.senderName} : ${conv.lastMessage.body}`
      : conv.lastMessage.body
    : 'Démarrez la conversation';

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex',
        gap: 9,
        width: '100%',
        textAlign: 'left',
        padding: '11px 13px',
        borderBottom: '2px solid var(--border)',
        background: conv.unreadCount > 0 ? 'var(--paper)' : 'var(--card)',
        border: 'none',
        borderBottomWidth: 2,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        alignItems: 'center',
        minHeight: 44,
      }}
    >
      {conv.type === 'group' ? <GroupChip /> : <span aria-hidden="true" style={singleDisc(avatarUrl)} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <b style={{ fontSize: 13, color: 'var(--ink)' }}>{conv.name}</b>
          {conv.unreadCount > 0 && (
            <span
              aria-label={`${conv.unreadCount} non lu`}
              style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: 'none' }}
            />
          )}
        </span>
        {isTyping ? (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
            en train d&apos;écrire…
          </span>
        ) : (
          <span
            style={{
              display: 'block',
              fontSize: 11,
              color: 'var(--ink2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {preview}
          </span>
        )}
      </span>
    </button>
  );
}

// ─── attachment tile (private → signed URL) ─────────────────────────────────────

function AttachmentTile({ mediaId, name, kind }: { mediaId: string; name: string; kind: 'image' | 'document' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(mediaId)
      .then((r) => !cancelled && setUrl(r.url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (kind === 'image') {
    return (
      <span style={{ display: 'block' }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} style={{ width: 140, height: 92, objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 8, display: 'block' }} />
        ) : (
          <span style={{ display: 'block', width: 140, height: 92, border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--tone)' }} />
        )}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink2)', fontWeight: 700, marginTop: 3 }}>{name}</span>
      </span>
    );
  }
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 8, padding: '7px 11px', textDecoration: 'none', background: 'var(--paper)' }}
    >
      {name}
    </a>
  );
}

// ─── chat thread ────────────────────────────────────────────────────────────────

function ChatThread({
  conv,
  blockedIds,
  onBlocked,
  onUnblocked,
}: {
  conv: ConversationItem;
  blockedIds: Set<string>;
  onBlocked: (userId: string) => void;
  onUnblocked: (userId: string) => void;
}) {
  const { account } = useSession();
  const myId = account?.id ?? null;
  const {
    activeMessages,
    messagesState,
    typing,
    hasMoreMessages,
    loadOlderMessages,
    closeThread,
    reloadConversations,
    respondToRequest,
    sendMessage,
    retryMessage,
    emitTyping,
  } = useMessaging();

  // MC-9 delta: DM request lifecycle. A `requested` DM shows the sender its "Demande envoyée" pill
  // (composer stays open — opening messages allowed) and the recipient an Accepter/Refuser bar
  // instead of the composer.
  const isRequest = conv.status === 'requested';
  const amRequester = conv.requestedBy === myId;
  const showRequestBar = isRequest && !amRequester;

  const others = otherParticipants(conv, myId);
  const [presenceOnline, setPresenceOnline] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  // MC-12: the "Gérer le groupe" members sub-view (standalone groups only).
  const [showMembers, setShowMembers] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dmOther = conv.type === 'dm' ? others[0] ?? null : null;
  // MC-12: management (add/kick/leave) applies to STANDALONE groups only (projectId === null);
  // project-linked groups are managed via their project surface (out of scope).
  const isStandaloneGroup = conv.type === 'group' && conv.projectId === null;

  // Reset the sub-view when switching conversations (ChatThread is reused, not remounted).
  useEffect(() => {
    setShowMembers(false);
  }, [conv.id]);
  // MC-10 round 2 (F10) — reflect an existing block in the header (kind='block').
  const isBlocked = dmOther ? blockedIds.has(dmOther.userId) : false;

  async function handleUnblock() {
    if (!dmOther) return;
    try {
      await deleteBlock(dmOther.userId, 'block');
      onUnblocked(dmOther.userId);
      reloadConversations();
    } catch {
      // ponytail: swallow; the header stays on "Débloquer" and the action is retryable.
    }
  }

  // Presence for a DM's other party (MC-8 read path).
  useEffect(() => {
    if (conv.type !== 'dm' || !others[0]) return;
    let cancelled = false;
    getPresence([others[0].userId])
      .then((r) => !cancelled && setPresenceOnline(Boolean(r.items[0]?.online)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages.length]);

  const otherIds = others.map((o) => o.userId);
  const myLastMessage = [...activeMessages].reverse().find((m) => m.senderId === myId && !m.pending && !m.failed);
  const allRead =
    myLastMessage != null && otherIds.length > 0 && otherIds.every((id) => myLastMessage.readBy.includes(id));

  const subtitle =
    conv.type === 'group'
      ? `${conv.participants.map((p) => p.name.split(' ')[0]).join(' · ')} · ${conv.participants.length} membres`
      : presenceOnline
        ? 'en ligne'
        : 'hors ligne';

  // MC-12: the members sub-view swaps the thread body inside the same frame (list→thread pattern).
  if (showMembers && isStandaloneGroup) {
    return <GroupMembersPanel conv={conv} myId={myId} onBack={() => setShowMembers(false)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(460px, 60dvh)' }}>
      {/* Thread header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '2px solid var(--border)', background: 'var(--paper)' }}>
        <button
          type="button"
          onClick={closeThread}
          aria-label="Retour aux conversations"
          style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--ink2)', display: 'inline-flex', padding: 4 }}
        >
          <ChevronLeftIcon size={20} />
        </button>
        {/* MC-12: a DM header links avatar + name to the other party's public profile. */}
        {dmOther ? (
          <Link
            href={`/${dmOther.slug}`}
            aria-label={`Voir le profil de ${conv.name}`}
            style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
          >
            <span aria-hidden="true" style={{ ...singleDisc(dmOther.avatarUrl), width: 32, height: 32 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</b>
              <span style={{ display: 'block', fontSize: 11, color: presenceOnline ? '#1f8a5b' : 'var(--ink2)', fontWeight: presenceOnline ? 700 : 400 }}>
                {subtitle}
              </span>
            </span>
          </Link>
        ) : (
          <>
            {conv.type === 'group' ? <GroupChip size={32} /> : <span aria-hidden="true" style={{ ...singleDisc(others[0]?.avatarUrl ?? null), width: 32, height: 32 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, color: 'var(--ink)' }}>{conv.name}</b>
              <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{subtitle}</div>
            </div>
          </>
        )}
        {/* MC-12: standalone-group management affordance (project-linked groups excluded). Compact
           black icon button (settings) instead of a wide text button. */}
        {isStandaloneGroup && (
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            aria-label="Gérer le groupe"
            title="Gérer le groupe"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, minHeight: 44, border: '2px solid var(--ink)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--ink)', color: '#fff', flex: 'none' }}
          >
            <GearIcon size={18} />
          </button>
        )}
        {/* MC-10 — block / unblock the other party (DM only). */}
        {dmOther && (
          <OverflowMenu
            label={`Plus d'actions sur la conversation avec ${conv.name}`}
            triggerStyle={{ minWidth: 36, minHeight: 36, padding: '4px 10px', background: 'none', border: 'none', color: 'var(--ink2)' }}
          >
            {(close) =>
              isBlocked ? (
                <MenuItem
                  accent
                  ariaLabel={`Débloquer ${conv.name}`}
                  onClick={() => {
                    close();
                    void handleUnblock();
                  }}
                >
                  Débloquer
                </MenuItem>
              ) : (
                <MenuItem
                  accent
                  onClick={() => {
                    close();
                    setBlockOpen(true);
                  }}
                >
                  Bloquer
                </MenuItem>
              )
            }
          </OverflowMenu>
        )}
      </div>

      {blockOpen && dmOther && (
        <BlockConfirmModal
          user={{ userId: dmOther.userId, name: conv.name }}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => {
            setBlockOpen(false);
            onBlocked(dmOther.userId);
            closeThread();
            reloadConversations();
          }}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        style={{ flex: 1, overflow: 'auto', padding: 14, background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {messagesState === 'loading' &&
          [0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="ep-skeleton-delayed"
              style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', width: '60%', height: 34, borderRadius: 11, background: 'var(--tone)', opacity: 0.5 }}
            />
          ))}

        {messagesState === 'error' && (
          <p role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, textAlign: 'center' }}>
            Impossible de charger la conversation.
          </p>
        )}

        {messagesState === 'ready' && activeMessages.length === 0 && (
          <p style={{ margin: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>Démarrez la conversation</p>
        )}

        {messagesState === 'ready' && activeMessages.length > 0 && (
          <>
            {hasMoreMessages && (
              <button
                type="button"
                onClick={loadOlderMessages}
                style={{ alignSelf: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Charger les messages précédents
              </button>
            )}
            <div style={{ alignSelf: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink2)', background: 'var(--card)', border: '2px solid var(--border)', borderRadius: 999, padding: '2px 10px' }}>
              Aujourd&apos;hui
            </div>
            {activeMessages.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.senderId === myId} conv={conv} onRetry={() => retryMessage(m)} />
            ))}
            {allRead && (
              <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--ink2)' }}>Lu</div>
            )}
            {typing[conv.id] && (
              <div style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                {conv.type === 'dm' ? `${conv.name} écrit…` : 'Quelqu’un écrit…'}
              </div>
            )}
          </>
        )}
      </div>

      {showRequestBar ? (
        <RequestActionBar
          onRespond={(action) => respondToRequest(conv.id, action)}
          onDeclined={closeThread}
        />
      ) : (
        <>
          {isRequest && amRequester && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink2)',
                background: 'var(--paper)',
                borderTop: '2px solid var(--border)',
                padding: '8px 13px',
                textAlign: 'center',
              }}
            >
              Demande envoyée
            </div>
          )}
          <Composer conversationId={conv.id} onSend={sendMessage} onTyping={emitTyping} />
        </>
      )}
    </div>
  );
}

// ─── DM request action bar (recipient) ───────────────────────────────────────────

function RequestActionBar({
  onRespond,
  onDeclined,
}: {
  onRespond: (action: 'accept' | 'decline') => Promise<void>;
  onDeclined: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function respond(action: 'accept' | 'decline') {
    setBusy(true);
    setError(false);
    try {
      await onRespond(action);
      // accept → this thread's conv flips to 'open' and the composer replaces the bar (the
      // parent re-renders from the moved conversation). decline → back to the list.
      if (action === 'decline') onDeclined();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: '2px solid var(--border)', padding: '10px 13px', background: 'var(--paper)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8 }}>
        Demande de message
      </div>
      {error && (
        <p role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', margin: '0 0 8px' }}>
          Action impossible. Réessayez.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => void respond('accept')}
          disabled={busy}
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.55 : 1,
            boxShadow: '2px 2px 0 var(--shadow)',
            fontFamily: 'inherit',
            minHeight: 44,
          }}
        >
          Accepter
        </button>
        <button
          type="button"
          onClick={() => void respond('decline')}
          disabled={busy}
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--card)',
            color: 'var(--ink)',
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.55 : 1,
            fontFamily: 'inherit',
            minHeight: 44,
          }}
        >
          Refuser
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  conv,
  onRetry,
}: {
  message: ThreadMessage;
  mine: boolean;
  conv: ConversationItem;
  onRetry: () => void;
}) {
  const senderName =
    conv.type === 'group' && !mine
      ? conv.participants.find((p) => p.userId === message.senderId)?.name ?? ''
      : '';

  // ponytail: PUB-6 seam — "⚑ Signaler ce message" (report a DM message, targetType 'message') lands
  // with PUB-6; no report modal / reports endpoint exists yet (MC-10 plan §8 D1). No UI this round.
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', opacity: message.pending ? 0.6 : 1 }}>
      {senderName && (
        <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700, margin: '0 0 3px 4px' }}>{senderName}</div>
      )}
      {message.attachments.map((a) => (
        <div key={a.mediaId} style={{ marginBottom: message.body ? 6 : 0 }}>
          <AttachmentTile mediaId={a.mediaId} name={a.name} kind={a.kind} />
        </div>
      ))}
      {message.body && (
        <div
          style={
            mine
              ? { background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: '11px 11px 3px 11px', padding: '8px 11px', fontSize: 13 }
              : { background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: '11px 11px 11px 3px', padding: '8px 11px', fontSize: 13 }
          }
        >
          {message.body}
        </div>
      )}
      {message.failed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, justifyContent: 'flex-end' }}>
          <span role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{message.error ?? "Échec de l'envoi"}</span>
          <button
            type="button"
            onClick={onRetry}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', border: '2px solid var(--accent)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

// ─── composer ───────────────────────────────────────────────────────────────────

// A composer attachment being uploaded / ready to send / failed.
type PendingAttachment = { id: string; name: string; status: 'uploading' | 'ready' | 'error'; mediaId?: string };

function Composer({
  conversationId,
  onSend,
  onTyping,
}: {
  conversationId: string;
  onSend: (id: string, body: string, attachmentIds?: string[]) => Promise<void>;
  onTyping: (id: string, isTyping: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const typingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === 'uploading');
  const hasError = pending.some((p) => p.status === 'error');

  function stopTyping() {
    if (typingRef.current) {
      typingRef.current = false;
      onTyping(conversationId, false);
    }
  }

  function addFile(file: File) {
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Client-side gate for UX; the server re-validates the allowlist + size.
    if (!ATTACHMENT_TYPES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
      setPending((p) => [...p, { id, name: file.name, status: 'error' }]);
      return;
    }
    setPending((p) => [...p, { id, name: file.name, status: 'uploading' }]);
    uploadAttachment(file)
      .then((mediaId) => setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'ready', mediaId } : x))))
      .catch(() => setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'error' } : x))));
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    const slots = MESSAGE_MAX_ATTACHMENTS - pending.length;
    files.slice(0, Math.max(0, slots)).forEach(addFile);
  }

  function removeChip(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  function submit() {
    if (uploading) return;
    const body = value.trim();
    const ids = pending.filter((p) => p.status === 'ready' && p.mediaId).map((p) => p.mediaId as string);
    if (!body && ids.length === 0) return;
    stopTyping();
    setValue('');
    setPending([]);
    void onSend(conversationId, body, ids.length ? ids : undefined);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: '2px solid var(--border)' }}
    >
      {pending.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
          {pending.map((a) => (
            <span
              key={a.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
                fontSize: 12,
                fontWeight: 700,
                color: a.status === 'error' ? 'var(--accent)' : 'var(--ink)',
                border: `2px solid ${a.status === 'error' ? 'var(--accent)' : 'var(--ink)'}`,
                borderRadius: 8,
                padding: '4px 8px',
                background: 'var(--paper)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{a.name}</span>
              {a.status === 'uploading' && (
                <span aria-hidden="true" style={{ fontSize: 11, color: 'var(--ink2)' }}>…</span>
              )}
              <button
                type="button"
                onClick={() => removeChip(a.id)}
                aria-label={`Retirer ${a.name}`}
                style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', padding: 0, minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' }}
              >
                <XIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {uploading && (
        <span role="status" style={{ width: '100%', fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
          Téléversement…
        </span>
      )}
      {hasError && (
        <span role="alert" style={{ width: '100%', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
          Échec de l&apos;envoi de la pièce jointe
        </span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        aria-label="Joindre un fichier"
        onClick={() => fileInputRef.current?.click()}
        style={{ border: 'none', background: 'none', color: 'var(--ink2)', cursor: 'pointer', display: 'inline-flex', padding: 4 }}
      >
        <PlusIcon size={18} />
      </button>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (!typingRef.current) {
            typingRef.current = true;
            onTyping(conversationId, true);
          }
        }}
        onBlur={stopTyping}
        aria-label="Écrire un message"
        placeholder="Répondre…"
        style={{ flex: 1, fontSize: 13, color: 'var(--ink)', background: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', outline: 'none', minWidth: 0 }}
      />
      <button
        type="submit"
        disabled={uploading}
        style={{ fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 8, padding: '7px 13px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.55 : 1, boxShadow: '2px 2px 0 var(--shadow)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
      >
        Envoyer
      </button>
    </form>
  );
}

// ─── the widget (FAB + panel) ────────────────────────────────────────────────────

export default function MessagingWidget() {
  const { account } = useSession();
  const myId = account?.id ?? null;
  const {
    totalUnread,
    conversations,
    conversationsState,
    connectionState,
    requests,
    requestsCount,
    panelState,
    activeConversationId,
    typing,
    openWidget,
    closeWidget,
    openConversation,
    reloadConversations,
    addConversation,
  } = useMessaging();

  const [query, setQuery] = useState('');
  // MC-9 delta: two-tab filter — "Conversations" (open threads + own outgoing requests) and
  // "Demandes" (incoming pending DM requests, with its own count badge).
  const [tab, setTab] = useState<'conversations' | 'requests'>('conversations');
  const [groupOpen, setGroupOpen] = useState(false);
  // MC-10 round 2 (F10) — the viewer's block set (kind='block'), for DM-header reflection.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = panelState === 'open';

  // ponytail: one GET per panel open (list capped at 200); move to a shared session store if a
  // third consumer of the block list appears.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMyBlocks()
      .then((r) => {
        if (!cancelled) setBlockedIds(new Set(r.items.filter((i) => i.kind === 'block').map((i) => i.userId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Focus into the panel on open AND whenever the view switches (list↔thread, thread↔thread):
  // opening a conversation unmounts the focused list-row button, so without re-homing focus it
  // falls to <body> — outside the dialog — and the dialog's Escape handler stops firing.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, activeConversationId]);

  // A request opened from the Demandes tab lives in `requests`, not `conversations`, until accepted.
  const activeConv = useMemo(
    () =>
      conversations.find((c) => c.id === activeConversationId) ??
      requests.find((c) => c.id === activeConversationId) ??
      null,
    [conversations, requests, activeConversationId],
  );

  const filtered = useMemo(() => {
    const source = tab === 'requests' ? requests : conversations;
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.participants.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [conversations, requests, tab, query]);

  // Widget is session-gated (renders on every page for authenticated users only).
  if (!account) return null;

  const badgeLabel = totalUnread > 0 ? `Messages, ${totalUnread} non lus` : 'Messages';

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Messages"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeWidget();
              fabRef.current?.focus();
            }
          }}
          style={{
            position: 'fixed',
            right: 26,
            bottom: 96,
            zIndex: 40,
            width: 320,
            maxWidth: 'calc(100vw - 20px)',
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 12,
            boxShadow: '6px 6px 0 var(--shadow)',
            overflow: 'hidden',
            outline: 'none',
          }}
          className="ep-chat-panel"
        >
          {/* Dark header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#16130f', color: '#f1ece1' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, textTransform: 'uppercase', letterSpacing: '.03em' }}>Messages</span>
            {totalUnread > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent)', borderRadius: 5, padding: '0 7px' }}>{totalUnread}</span>
            )}
            <div style={{ flex: 1 }} />
            {/* MC-9 amendment: primary accent-red group-create trigger (matches other primary actions). */}
            <button
              type="button"
              onClick={() => setGroupOpen(true)}
              style={{ fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 10px', minHeight: 30, fontFamily: 'inherit' }}
            >
              ＋ Groupe
            </button>
            {/* MC-9 amendment: the minimize "Réduire" (▁) button is removed — "Fermer" (X) already
               collapses the widget to the FAB. */}
            <button
              type="button"
              onClick={() => {
                closeWidget();
                fabRef.current?.focus();
              }}
              aria-label="Fermer"
              style={{ color: '#cabfb2', cursor: 'pointer', background: 'none', border: 'none', display: 'inline-flex', padding: 2 }}
            >
              <XIcon size={15} />
            </button>
          </div>

          {/* Reconnecting banner */}
          {connectionState === 'reconnecting' && (
            <div role="status" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--paper)', borderBottom: '2px solid var(--border)', padding: '6px 13px', textAlign: 'center' }}>
              Reconnexion…
            </div>
          )}

          {activeConv ? (
            <ChatThread
              conv={activeConv}
              blockedIds={blockedIds}
              onBlocked={(id) => setBlockedIds((s) => new Set(s).add(id))}
              onUnblocked={(id) =>
                setBlockedIds((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                })
              }
            />
          ) : (
            <>
              {/* Search field (D2) */}
              <div style={{ padding: '9px 11px', borderBottom: '2px solid var(--border)' }}>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Rechercher une conversation"
                  placeholder="Rechercher…"
                  style={{ width: '100%', fontSize: 13, color: 'var(--ink)', background: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 8, padding: '7px 11px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Two-tab filter: Conversations / Demandes (n) */}
              <div
                role="tablist"
                aria-label="Filtrer les messages"
                style={{ display: 'flex', gap: 6, padding: '8px 11px', borderBottom: '2px solid var(--border)' }}
              >
                {(['conversations', 'requests'] as const).map((t) => {
                  const active = tab === t;
                  const isReq = t === 'requests';
                  const label = isReq
                    ? requestsCount > 0
                      ? `Demandes (${requestsCount})`
                      : 'Demandes'
                    : 'Conversations';
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={
                        isReq && requestsCount > 0
                          ? `Demandes, ${requestsCount} en attente`
                          : undefined
                      }
                      onClick={() => setTab(t)}
                      style={{
                        flex: 1,
                        minHeight: 36,
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        borderRadius: 8,
                        border: '2px solid var(--ink)',
                        background: active ? 'var(--ink)' : 'var(--card)',
                        color: active ? 'var(--paper)' : 'var(--ink)',
                        boxShadow: active ? '2px 2px 0 var(--shadow)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div style={{ maxHeight: 'min(420px, 55dvh)', overflow: 'auto' }}>
                {conversationsState === 'loading' &&
                  [0, 1, 2].map((i) => (
                    <div key={i} aria-hidden="true" className="ep-skeleton-delayed" style={{ height: 58, borderBottom: '2px solid var(--border)', background: 'var(--tone)', opacity: 0.4 }} />
                  ))}

                {conversationsState === 'error' && (
                  <div role="alert" style={{ padding: 16, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '0 0 10px' }}>Impossible de charger vos messages.</p>
                    <button type="button" onClick={reloadConversations} style={{ fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Réessayer
                    </button>
                  </div>
                )}

                {conversationsState === 'ready' && filtered.length === 0 && (
                  <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink2)' }}>
                    {tab === 'requests'
                      ? 'Aucune demande'
                      : query.trim()
                        ? 'Aucune conversation trouvée.'
                        : 'Aucune conversation pour l’instant.'}
                  </p>
                )}

                {conversationsState === 'ready' &&
                  filtered.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conv={c}
                      myId={myId}
                      isTyping={Boolean(typing[c.id])}
                      onOpen={() => openConversation(c.id)}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB launcher */}
      <button
        ref={fabRef}
        type="button"
        onClick={open ? closeWidget : openWidget}
        aria-label={badgeLabel}
        aria-expanded={open}
        style={{
          position: 'fixed',
          right: 26,
          bottom: 26,
          zIndex: 40,
          width: 58,
          height: 58,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: '3px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#fff',
        }}
      >
        <MailIcon size={24} />
        {totalUnread > 0 && (
          <span
            aria-hidden="true"
            style={{ position: 'absolute', top: -5, right: -5, minWidth: 21, height: 21, borderRadius: 11, background: 'var(--ink)', color: 'var(--paper)', border: '2px solid #fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}
          >
            {totalUnread}
          </span>
        )}
      </button>

      {groupOpen && (
        <GroupCreateModal
          onClose={() => setGroupOpen(false)}
          onCreated={(conv) => {
            setGroupOpen(false);
            addConversation(conv);
            openConversation(conv.id);
          }}
        />
      )}
    </>
  );
}
