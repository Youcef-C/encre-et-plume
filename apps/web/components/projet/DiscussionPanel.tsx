'use client';

// CS-8 — « Espace projet » → Discussion tab. Faithful replica of the prototype's
// data-projview="discussion" section (.dc.html 1392–1401): halftone group discs + "Discussion du
// projet" header, the paper-coloured log with incoming/outgoing bubbles and framed attachment tiles,
// and the "＋ / Écrire à l'équipe… / Envoyer" composer.
//
// Planned deviations (plan §1.3): D-1 the member line's ✒/🖌 are icons (no emojis, house rule) ·
// D-2 every bubble carries its time (the story's a11y criterion) · D-3 own messages offer
// « Supprimer » behind a confirmation · D-4 the prototype's fixed height:460px becomes a min-height
// so the pane breathes at 1280 and does not overflow at 375.
//
// The thread IS MC-9's conversation (Conversation.projectId) — this panel talks to the two
// project-scoped routes and reuses the shared socket for `message:new`.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MessageAttachment, MessageDto, WorkspaceMember, WsMessageNew } from '@encre-et-plume/shared';
import { MESSAGE_MAX_ATTACHMENTS, WS_EVENTS } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { useMessaging } from '../../lib/messaging';
import {
  deleteMessage as apiDeleteMessage,
  getMediaSignedUrl,
  getProjectMessages,
  sendProjectMessage,
} from '../../lib/api';
import { ATTACHMENT_ACCEPT, uploadAttachmentFile, validateAttachmentFile } from '../../lib/attachmentUpload';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import { BrushIcon, FileTextIcon, PenNibIcon } from '../icons';
import OverflowMenu, { MenuItem } from '../OverflowMenu';
import ConfirmDialog from './ConfirmDialog';

/** A thread row: a server message, or an optimistic one still in flight / failed. */
type ThreadMessage = MessageDto & { pending?: boolean; failed?: boolean; error?: string };

/** A composer attachment being uploaded / ready to send / rejected. */
type PendingAttachment = {
  id: string;
  name: string;
  status: 'uploading' | 'ready' | 'error';
  pct: number;
  mediaId?: string;
  error?: string;
};

// The prototype's attachment frame: a halftone plate that doubles as the image's loading state.
const HALFTONE_PLATE: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  backgroundImage:
    'radial-gradient(rgba(22,19,15,.5) 1.5px,transparent 1.6px),linear-gradient(150deg,var(--ink) 40%,var(--accent) 40%)',
  backgroundSize: 'var(--dot) var(--dot), cover',
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Two overlapping halftone discs — the prototype's project-group chip (proto 1393). */
function GroupDiscs() {
  const disc: React.CSSProperties = {
    position: 'absolute',
    width: 23,
    height: 23,
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    background: 'var(--tone)',
  };
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: 34, height: 30, flex: 'none' }}>
      <span style={{ ...disc, top: 0, left: 0 }} />
      <span style={{ ...disc, bottom: 0, right: 0 }} />
    </span>
  );
}

/** D-1: the prototype's ✒ / 🖌 next to a name are icons from the shared set, never emoji. */
function RoleIcons({ roles }: { roles: string[] }) {
  return (
    <>
      {roles.map((role) => {
        if (role === 'dessinateur' || role === 'dessinatrice')
          return <BrushIcon key={role} size={11} style={{ display: 'inline', marginLeft: 3 }} />;
        if (role === 'scenariste')
          return <PenNibIcon key={role} size={11} style={{ display: 'inline', marginLeft: 3 }} />;
        return null;
      })}
    </>
  );
}

/** A private attachment: bytes never come from the API — F-10 hands out a short-lived signed URL. */
function AttachmentTile({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMediaSignedUrl(attachment.mediaId)
      .then((r) => !cancelled && setUrl(r.url))
      .catch(() => !cancelled && setBroken(true));
    return () => {
      cancelled = true;
    };
  }, [attachment.mediaId]);

  if (attachment.kind === 'document') {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          minHeight: 44,
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink)',
          background: 'var(--card)',
          border: '2px solid var(--ink)',
          borderRadius: 8,
          padding: '9px 13px',
          textDecoration: 'none',
          overflowWrap: 'anywhere',
        }}
      >
        <FileTextIcon size={15} />
        {attachment.name}
      </a>
    );
  }

  return (
    <>
      {/* The halftone plate is the frame AND the loading/failed state — the tile never collapses. */}
      <span
        className="ep-discussion-thumb"
        style={{
          display: 'block',
          width: 160,
          height: 104,
          border: '2px solid var(--ink)',
          borderRadius: 8,
          overflow: 'hidden',
          ...HALFTONE_PLATE,
        }}
      >
        {url && !broken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.name}
            onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </span>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--ink2)', marginTop: 3, fontWeight: 700, overflowWrap: 'anywhere' }}>
        {attachment.name}
      </span>
    </>
  );
}

function Bubble({
  message,
  mine,
  senderName,
  senderRoles,
  onRetry,
  onDelete,
}: {
  message: ThreadMessage;
  mine: boolean;
  senderName: string;
  senderRoles: string[];
  onRetry: () => void;
  onDelete: () => void;
}) {
  const hasAttachments = message.attachments.length > 0;
  // R2-3 — ONE discreet entry point per bubble, on its LEFT, instead of a row of icons. Revealed on
  // hover AND on focus (CSS below), so the keyboard is never locked out. Its only item today is
  // « Supprimer »; MC-15 adds Répondre / Modifier / J'aime and reuses this shell on every surface.
  const excerpt = (message.body || message.attachments[0]?.name || '').trim().slice(0, 40);
  return (
    <div
      data-testid={`message-${message.id}`}
      data-mine={mine ? 'true' : 'false'}
      className={hasAttachments ? 'ep-discussion-row ep-discussion-row--wide' : 'ep-discussion-row'}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        opacity: message.pending ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {mine && !message.pending && !message.failed && (
        <span className="ep-bubble-actions" style={{ flex: 'none' }}>
          <OverflowMenu
            label={excerpt ? `Actions du message « ${excerpt} »` : 'Actions du message'}
            // R3-1 — the menu opens toward the middle of the thread, so it never points off it. The
            // caller already decides each bubble's `align-self`; it passes that same direction here
            // instead of the menu re-deriving it from geometry. Only own (right-aligned) bubbles carry
            // a menu today — delete is author-only — so 'right' lands when MC-15 adds incoming items.
            placement={mine ? 'left' : 'right'}
            width={150}
            triggerStyle={{
              border: 'none',
              background: 'none',
              color: 'var(--ink2)',
              minWidth: 34,
              minHeight: 44,
              padding: 0,
              fontSize: 18,
            }}
          >
            {(close) => (
              <MenuItem
                accent
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                Supprimer
              </MenuItem>
            )}
          </OverflowMenu>
        </span>
      )}
      {/* The bubble column itself keeps the prototype's block stacking (round-1 rendering). */}
      <div style={{ minWidth: 0 }}>
      {!mine && (
        <div style={{ fontSize: 11, color: 'var(--ink2)', margin: '0 0 3px 4px', fontWeight: 700 }}>
          {senderName}
          <RoleIcons roles={senderRoles} />
        </div>
      )}

      {message.attachments.map((a) => (
        <div key={a.mediaId} style={{ marginBottom: message.body ? 6 : 0 }}>
          <AttachmentTile attachment={a} />
        </div>
      ))}

      {message.body && (
        <div
          style={{
            padding: '9px 13px',
            fontSize: 14,
            lineHeight: 1.45,
            border: '2px solid var(--ink)',
            overflowWrap: 'anywhere',
            ...(mine
              ? { background: 'var(--ink)', color: 'var(--paper)', borderRadius: '12px 12px 3px 12px' }
              : { background: 'var(--card)', color: 'var(--ink)', borderRadius: '12px 12px 12px 3px' }),
          }}
        >
          {message.body}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 3,
          justifyContent: mine ? 'flex-end' : 'flex-start',
        }}
      >
        {/* D-2 — the prototype draws no time; a coordination thread is unusable without one. */}
        <time dateTime={message.createdAt} style={{ fontSize: 11, color: 'var(--ink2)' }}>
          {timeLabel(message.createdAt)}
        </time>
      </div>

      {message.failed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
            {message.error ?? "Échec de l'envoi"}
          </span>
          <button
            type="button"
            onClick={onRetry}
            aria-label="Réessayer l'envoi"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'none',
              border: '2px solid var(--accent)',
              borderRadius: 5,
              padding: '3px 9px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

export default function DiscussionPanel({
  slug,
  members,
  isMember,
}: {
  slug: string;
  members: WorkspaceMember[];
  /** The thread is member-only (the server 403/404s a stranger). A non-member on a PUBLIC project can
   *  still open this tab from the read-only workspace — tell them why it is empty instead of firing a
   *  request that can only fail and showing them a network error. */
  isMember: boolean;
}) {
  const { account } = useSession();
  const { socket } = useMessaging();
  const myId = account?.id ?? null;

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prependHeightRef = useRef<number | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  // ── history ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    setState('loading');
    getProjectMessages(slug)
      .then((page) => {
        if (cancelled) return;
        // The API is newest-first; the thread reads oldest→newest.
        setMessages([...page.items].reverse());
        setConversationId(page.conversationId);
        setCanPost(page.canPost);
        setCursor(page.nextCursor);
        setState('ready');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey, isMember]);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    // Remember the height so prepending older messages doesn't yank the reader upward.
    prependHeightRef.current = logRef.current?.scrollHeight ?? null;
    try {
      const page = await getProjectMessages(slug, cursor);
      setMessages((list) => [...[...page.items].reverse(), ...list]);
      setCursor(page.nextCursor);
    } catch {
      prependHeightRef.current = null; // nothing was prepended
    } finally {
      setLoadingOlder(false);
    }
  }, [cursor, loadingOlder, slug]);

  // Auto-load older pages when the top sentinel comes into view; the button below stays for
  // keyboard / no-IntersectionObserver users.
  const topSentinel = useInfiniteScroll<HTMLDivElement>(loadOlder, cursor != null);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (prependHeightRef.current != null) {
      // Restore the reading position after an older page was prepended.
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
      return;
    }
    // New message at the bottom: follow it ONLY if the reader was already there.
    if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onNew = (payload?: unknown) => {
      const p = payload as WsMessageNew | undefined;
      if (!p || p.conversationId !== conversationIdRef.current) return; // another thread's message
      setMessages((list) => mergeMessage(list, p.message));
    };
    // A message deleted elsewhere (D-3) or any thread change → re-read this thread.
    const onUpdated = (payload?: unknown) => {
      const p = payload as { conversationId?: string } | undefined;
      if (p?.conversationId !== conversationIdRef.current) return;
      setReloadKey((k) => k + 1);
    };
    socket.on(WS_EVENTS.messageNew, onNew);
    socket.on(WS_EVENTS.conversationUpdated, onUpdated);
    return () => {
      socket.off(WS_EVENTS.messageNew, onNew);
      socket.off(WS_EVENTS.conversationUpdated, onUpdated);
    };
  }, [socket]);

  // ── send ───────────────────────────────────────────────────────────────────
  const doSend = useCallback(
    async (tempId: string, text: string, mediaIds: string[]) => {
      try {
        const real = await sendProjectMessage(slug, {
          ...(text ? { text } : {}),
          ...(mediaIds.length ? { attachments: mediaIds.map((mediaId) => ({ mediaId })) } : {}),
        });
        setMessages((list) => mergeMessage(list.filter((m) => m.id !== tempId), real));
      } catch (e) {
        // The server's French copy (rate limit, invalid attachment) — never an English transport error.
        const raw = (e as { message?: string } | null)?.message;
        const error = raw && /^[^A-Za-z]*[A-ZÀ-Ü]/.test(raw) ? raw : undefined;
        setMessages((list) =>
          list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, error } : m)),
        );
      }
    },
    [slug],
  );

  const send = useCallback(
    (text: string, attachments: MessageAttachment[], mediaIds: string[]) => {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      nearBottomRef.current = true; // my own message always scrolls into view
      setMessages((list) => [
        ...list,
        {
          id: tempId,
          conversationId: conversationIdRef.current ?? '',
          senderId: myId ?? '',
          body: text,
          attachments,
          createdAt: new Date().toISOString(),
          readBy: [],
          pending: true,
        },
      ]);
      void doSend(tempId, text, mediaIds);
    },
    [doSend, myId],
  );

  const retry = useCallback(
    (message: ThreadMessage) => {
      setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)));
      void doSend(
        message.id,
        message.body,
        message.attachments.map((a) => a.mediaId),
      );
    },
    [doSend],
  );

  // ── delete (D-3) ───────────────────────────────────────────────────────────
  async function confirmDelete() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    const snapshot = messages;
    setMessages((list) => list.filter((m) => m.id !== id)); // optimistic
    try {
      await apiDeleteMessage(id);
    } catch {
      setMessages(snapshot); // the server refused — put it back
    }
  }

  const memberById = new Map(members.map((m) => [m.accountId, m]));

  return (
    <section className="ep-discussion" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header (proto 1393) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 18px',
          borderBottom: '2px solid var(--border)',
        }}
      >
        <GroupDiscs />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>Discussion du projet</b>
          <div data-testid="discussion-members" style={{ fontSize: 12, color: 'var(--ink2)' }}>
            {members.map((m, i) => (
              <span key={m.accountId}>
                {i > 0 && <span> · </span>}
                {m.displayName}
                <RoleIcons roles={m.roles} />
              </span>
            ))}
            <span> · {members.length} membre{members.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Log (proto 1394–1398) */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Messages du projet"
        className="ep-discussion-log"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        style={{
          flex: 1,
          background: 'var(--paper)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        {!isMember && (
          <p style={{ margin: 'auto', maxWidth: 320, textAlign: 'center', fontSize: 14, color: 'var(--ink2)', lineHeight: 1.5 }}>
            La discussion est réservée aux membres du projet.
          </p>
        )}

        {isMember && state === 'loading' && (
          <div role="status" aria-label="Chargement de la discussion" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="ep-skeleton-delayed"
                style={{
                  alignSelf: i % 2 ? 'flex-end' : 'flex-start',
                  width: '60%',
                  height: 38,
                  borderRadius: 12,
                  background: 'var(--tone)',
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        )}

        {isMember && state === 'error' && (
          <div style={{ margin: 'auto', textAlign: 'center' }}>
            <p role="alert" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '0 0 10px' }}>
              Impossible de charger la discussion.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="ep-btn-primary"
              style={{
                fontSize: 13,
                fontWeight: 700,
                border: '2px solid var(--ink)',
                borderRadius: 8,
                padding: '8px 16px',
                minHeight: 44,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {isMember && state === 'ready' && messages.length === 0 && (
          <p style={{ margin: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>Aucun message</p>
        )}

        {isMember && state === 'ready' && messages.length > 0 && (
          <>
            {cursor && (
              <>
                <div ref={topSentinel} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  style={{
                    alignSelf: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: loadingOlder ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    minHeight: 44,
                  }}
                >
                  {loadingOlder ? 'Chargement…' : 'Charger les messages précédents'}
                </button>
              </>
            )}
            {messages.map((m) => {
              const sender = memberById.get(m.senderId);
              return (
                <Bubble
                  key={m.id}
                  message={m}
                  mine={m.senderId === myId}
                  senderName={sender?.displayName ?? 'Membre'}
                  senderRoles={sender?.roles ?? []}
                  onRetry={() => retry(m)}
                  onDelete={() => setConfirmId(m.id)}
                />
              );
            })}
          </>
        )}
      </div>

      {/* Composer (proto 1400) */}
      {isMember && canPost && <Composer onSend={send} />}

      {confirmId && (
        <ConfirmDialog
          title="Supprimer le message"
          message="Ce message sera définitivement retiré de la discussion, pour toute l’équipe."
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </section>
  );
}

// ─── composer ─────────────────────────────────────────────────────────────────

function Composer({
  onSend,
}: {
  onSend: (text: string, attachments: MessageAttachment[], mediaIds: string[]) => void;
}) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === 'uploading');
  const ready = pending.filter((p) => p.status === 'ready' && p.mediaId);
  // F6 — the server re-checks, but never offer a send that is guaranteed to 400.
  const canSend = (value.trim().length > 0 || ready.length > 0) && !uploading;

  function addFile(file: File) {
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const invalid = validateAttachmentFile(file);
    if (invalid) {
      setPending((p) => [...p, { id, name: file.name, status: 'error', pct: 0, error: invalid }]);
      return;
    }
    setPending((p) => [...p, { id, name: file.name, status: 'uploading', pct: 0 }]);
    uploadAttachmentFile(file, (pct) =>
      setPending((p) => p.map((x) => (x.id === id ? { ...x, pct } : x))),
    )
      .then((mediaId) =>
        setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'ready', pct: 100, mediaId } : x))),
      )
      .catch((e: Error) =>
        setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'error', error: e.message } : x))),
      );
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // let the same file be re-picked
    const slots = MESSAGE_MAX_ATTACHMENTS - pending.length;
    files.slice(0, Math.max(0, slots)).forEach(addFile);
  }

  function submit() {
    if (!canSend) return;
    const text = value.trim();
    setValue('');
    setPending([]);
    onSend(
      text,
      ready.map((p) => ({ mediaId: p.mediaId as string, name: p.name, kind: 'image' as const })),
      ready.map((p) => p.mediaId as string),
    );
  }

  return (
    <form
      className="ep-discussion-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderTop: '2px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      {pending.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pending.map((a) => (
            <li
              key={a.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                maxWidth: '100%',
                fontSize: 12,
                fontWeight: 700,
                color: a.status === 'error' ? 'var(--accent)' : 'var(--ink)',
                border: `2px solid ${a.status === 'error' ? 'var(--accent)' : 'var(--ink)'}`,
                borderRadius: 8,
                padding: '4px 9px',
                background: 'var(--paper)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {a.name}
              </span>
              {a.status === 'uploading' && (
                // Progress as a number too, never a bar alone (status is not colour/shape-only).
                <progress value={a.pct} max={100} aria-label={`Téléversement de ${a.name}`} style={{ width: 56, height: 8 }} />
              )}
              {a.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--ink2)' }}>{a.pct} %</span>}
              {a.status === 'error' && (
                <span role="alert" style={{ fontSize: 11 }}>
                  {a.error}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))}
                aria-label={`Retirer ${a.name}`}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 24,
                  minHeight: 24,
                  padding: 0,
                  fontSize: 15,
                  fontFamily: 'inherit',
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      />
      {/* « ＋ » stays typography (CLAUDE.md keeps ＋ literal); the control is a labelled button. */}
      <button
        type="button"
        aria-label="Joindre un fichier"
        onClick={() => fileRef.current?.click()}
        style={{
          fontSize: 20,
          lineHeight: 1,
          color: 'var(--ink2)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          minWidth: 44,
          minHeight: 44,
          padding: 0,
        }}
      >
        ＋
      </button>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Écrire à l’équipe"
        placeholder="Écrire à l’équipe…"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          color: 'var(--ink)',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          borderRadius: 8,
          padding: '8px 14px',
          fontFamily: 'inherit',
          outline: 'none',
          minHeight: 44,
        }}
      />
      <button
        type="submit"
        disabled={!canSend}
        className="ep-btn-primary"
        style={{
          fontSize: 14,
          fontWeight: 700,
          border: '2px solid var(--ink)',
          borderRadius: 8,
          padding: '8px 16px',
          minHeight: 44,
          cursor: canSend ? 'pointer' : 'not-allowed',
          opacity: canSend ? 1 : 0.55,
          boxShadow: '2px 2px 0 var(--shadow)',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        Envoyer
      </button>
    </form>
  );
}

/**
 * Dedupe by id; when the server echo races my optimistic bubble (temp id ≠ real id), reconcile it
 * against the pending row of the same sender + body instead of drawing the message twice.
 */
function mergeMessage(list: ThreadMessage[], msg: MessageDto): ThreadMessage[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = msg;
    return next;
  }
  const pending = list.findIndex((m) => m.pending && m.senderId === msg.senderId && m.body === msg.body);
  if (pending >= 0) {
    const next = [...list];
    next[pending] = msg;
    return next;
  }
  return [...list, msg];
}
