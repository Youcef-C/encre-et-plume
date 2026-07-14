'use client';

// CS-4 — collaborative script editor "Éditeur". Replica of prototype `data-page="editeur"` (header,
// toolbar, planche/case A4 canvas, right sidebar). Real wiring: TipTap v3 + Yjs over the /editor WS
// namespace, in-place autosave ("Enregistré ✓"), explicit version snapshots, per-case comments,
// live presence + named colored carets + typing. Iter 2: StrictMode-safe provider lifecycle,
// clientID-keyed presence, fuller toolbar, A4 sheet, working file open/import, chapter/page switcher.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Y from 'yjs';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import {
  COLLAB_COLORS,
  type EditorDocumentResponse,
  type CaseCommentDto,
  type EditorAwarenessState,
  type AssetItem,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { uploadAssetFile, validateAssetFile } from '../../lib/assetUpload';
import { EditorCollabProvider, type CollabStatus } from '../../lib/editor-collab';
import { buildRichTextExtensions } from '../editor/richtext/core';
import { plancheExtensions, blankPlancheDoc, casePlaceholder } from '../editor/richtext/planche-schema';
import { commentRangesFrom, commentColor, resolveCommentTexts, quoteChanged } from '../editor/richtext/comment-highlight';
import RichTextToolbar from '../editor/richtext/RichTextToolbar';
import PageSwitcher from './PageSwitcher';
import ConfirmDialog from '../projet/ConfirmDialog';
import { FileTextIcon, ChatIcon, CaretDownIcon, TrashIcon } from '../icons';

const colorForId = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLLAB_COLORS[h % COLLAB_COLORS.length];
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Peer {
  id: string;
  name: string;
  color: string;
  role: 'pen' | 'brush';
  typing: boolean;
  avatar: string | null;
}

export interface EditorClientProps {
  pageId: string;
  slug: string;
  /** D9 — optional `?asset=<id>`: open a chosen scenario/texte asset instead of the card default. */
  assetId?: string | null;
}

export default function EditorClient({ pageId, slug, assetId }: EditorClientProps) {
  const { account, loading: sessionLoading } = useSession();
  const router = useRouter();

  const [doc, setDoc] = useState<EditorDocumentResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  // Remember the last card opened in the editor for this project, so the kanban header "Éditeur"
  // button can reopen it (ProjectWorkspace reads this key; falls back to the first board card).
  useEffect(() => {
    try {
      localStorage.setItem(`ep:lastEditor:${slug}`, pageId);
    } catch {
      /* storage unavailable (private mode) — the fallback to the first card still works */
    }
  }, [slug, pageId]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      const next = `/projet/${slug}/editeur/${pageId}${assetId ? `?asset=${assetId}` : ''}`;
      router.replace(`/connexion?next=${encodeURIComponent(next)}`);
      return;
    }
    let alive = true;
    setLoadState('loading');
    api
      .getEditorDocument(pageId, assetId ?? undefined)
      .then((d) => alive && (setDoc(d), setLoadState('ready')))
      .catch(() => alive && setLoadState('error'));
    return () => {
      alive = false;
    };
  }, [pageId, slug, assetId, account, sessionLoading, router]);

  if (sessionLoading || loadState === 'loading' || !account) {
    return (
      <div role="status" aria-label="Chargement de l’éditeur…" className="ep-skeleton-delayed" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px' }}>
        <div aria-hidden="true" style={{ height: 420, background: 'var(--tone)', opacity: 0.35, borderRadius: 10 }} />
      </div>
    );
  }
  if (loadState === 'error' || !doc) {
    return (
      <div style={{ maxWidth: 620, margin: '48px auto', padding: '0 20px' }}>
        <div style={{ border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '6px 6px 0 var(--shadow)', background: 'var(--card)', padding: '28px 24px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', marginBottom: 10 }}>Éditeur indisponible</div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 16 }}>Cette page n’existe pas ou vous n’y avez pas accès.</p>
          <Link href={`/projet/${slug}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>‹ Projet</Link>
        </div>
      </div>
    );
  }

  return <EditorLoaded key={`${pageId}:${assetId ?? ''}`} pageId={pageId} slug={slug} assetId={assetId ?? undefined} initial={doc} account={account} />;
}

function EditorLoaded({
  pageId,
  slug,
  assetId,
  initial,
  account,
}: {
  pageId: string;
  slug: string;
  assetId?: string;
  initial: EditorDocumentResponse;
  account: { id: string; displayName: string; role: string; avatar?: string | null };
}) {
  const [asset, setAsset] = useState(initial.asset);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [comments, setComments] = useState<CaseCommentDto[]>(initial.comments);
  // Transient toast stack (version saved, import errors, presence join/leave). No toast library — a
  // fixed bottom-center stack, each entry auto-removed after its lifetime.
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastSeq = useRef(0);
  const [provider, setProvider] = useState<EditorCollabProvider | null>(null);

  // F-I7 — the shared Yjs doc, seeded from the persisted CRDT bytes shipped on the initial load BEFORE
  // the editor binds. This is the deterministic hydration fix: an empty Y.Doc makes the editor fill the
  // schema-required first caseBlock (an EMPTY default), which y-prosemirror persists into the fragment;
  // if the WS `editor:sync` then merges the server's real caseBlock in, the doc ends up with two CASE 1
  // blocks (a fresh open renders empty content or duplicates — the flaky bug). Applying the server bytes
  // here first means the fragment is already populated when the editor mounts (no default fill), and the
  // later WS sync re-applies the SAME bytes (Yjs is idempotent), so there's nothing to duplicate.
  // EditorLoaded is keyed by `${pageId}:${assetId}`, so this runs once per opened document.
  const ydoc = useMemo(() => {
    const d = new Y.Doc();
    if (initial.ydocState) {
      try {
        Y.applyUpdate(d, decodeState(initial.ydocState));
      } catch {
        // Corrupt/partial snapshot → fall through to the empty-doc seed path (seedIfEmpty).
      }
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seededRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const myColor = colorForId(account.id);
  const myRole: 'pen' | 'brush' = account.role.includes('dessin') ? 'brush' : 'pen';

  const pushToast = useCallback((msg: string, ms = 3000) => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list, { id, msg }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ms);
  }, []);

  // ── StrictMode-safe provider lifecycle (D8/F-I1) ─────────────────────────────
  // The provider is created + owned by THIS effect: a StrictMode mount→unmount→remount destroys the
  // first provider (socket.disconnect() disables auto-reconnect) and creates a FRESH one that
  // connects, instead of re-attaching to a dead socket. The `destroyed` guard keeps the torn-down
  // instance from latching the banner to "Reconnexion en cours".
  useEffect(() => {
    seededRef.current = false;
    setSynced(false);
    setStatus('connecting');
    const p = new EditorCollabProvider(
      ydoc,
      pageId,
      {
        onStatus: setStatus,
        onSync: () => setSynced(true),
        onMaterialized: (aid) => setAsset((a) => a ?? { id: aid, filename: 'scenario.html', currentVersion: 1 }),
        onComment: (raw) => setComments((list) => mergeComment(list, raw as CaseCommentDto)),
        // CS-15 — a peer (or our own broadcast) deleted a comment: drop it; the highlight-repaint effect
        // (keyed on `comments`) clears its decoration. Idempotent with the optimistic remove below.
        onCommentDeleted: (id) => setComments((list) => list.filter((c) => c.id !== id)),
      },
      assetId,
    );
    p.setLocalUser('user', { id: account.id, name: account.displayName, color: myColor, role: myRole, avatar: account.avatar ?? null });
    p.setLocalUser('typing', false);
    setProvider(p);
    return () => {
      p.destroy();
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ydoc, pageId, assetId, account.id]);

  // Live presence from awareness — recreated whenever the provider instance changes. The 'change'
  // event fires on clients ADDED, UPDATED and REMOVED, and readPeers recomputes the full roster
  // (excluding self by clientID), so a peer that disconnects drops out promptly. We also diff the
  // roster by clientID to toast a join/leave; the first population (existing peers on open) is silent.
  useEffect(() => {
    if (!provider) return;
    const selfClientId = provider.awareness.clientID;
    const selfUserId = account.id;
    // Key the roster by user.id (not clientID): a reconnecting peer keeps its account id, so a reload
    // doesn't fire a spurious leave+join, and the local account's own ghost is excluded.
    let known = new Map<string, string>();
    let primed = false;
    const namesNow = () => {
      const m = new Map<string, string>();
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId === selfClientId) return;
        const u = (state as Partial<EditorAwarenessState>).user;
        if (!u) return;
        const uid = u.id ?? String(clientId);
        if (uid === selfUserId) return;
        if (!m.has(uid)) m.set(uid, u.name ?? 'Collaborateur');
      });
      return m;
    };
    const sync = () => {
      const now = namesNow();
      if (primed) {
        now.forEach((name, id) => {
          if (!known.has(id)) pushToast(`${name} a rejoint l’éditeur`, 2500);
        });
        known.forEach((name, id) => {
          if (!now.has(id)) pushToast(`${name} a quitté l’éditeur`, 2500);
        });
      }
      known = now;
      primed = true;
      setPeers(readPeers(provider, selfUserId));
    };
    provider.awareness.on('change', sync);
    sync();
    return () => {
      provider.awareness.off('change', sync);
    };
  }, [provider, pushToast, account.id]);

  // ── The TipTap editor bound to the Y.Doc; recreated when the provider instance changes. ──────
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        ...buildRichTextExtensions({
          collab: true,
          ownDocument: true,
          placeholder: ({ editor: ed, pos }) => casePlaceholder({ editor: ed, pos, prose: true }),
        }),
        ...plancheExtensions,
        Collaboration.configure({ document: ydoc }),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider: { awareness: provider.awareness } as never,
                user: { id: account.id, name: account.displayName, color: myColor, role: myRole },
                render: caretRender,
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: { 'aria-label': 'Éditeur de scénario', role: 'textbox', 'aria-multiline': 'true' },
        // Bug fix — Word-like caret scrolling (scrollCaretIntoView). The editor has no inner scroll
        // frame (Item 1): the whole window scrolls. This fires only when PM wants to scroll the
        // selection into view (typing / arrow nav / programmatic reveal — NOT a plain mouse click), and
        // scrolls only when the caret would leave the VISIBLE viewport, so clicking leaves the view put
        // and typing on a visible line never shifts the camera.
        handleScrollToSelection: scrollCaretIntoView,
      },
    },
    [provider],
  );

  // Seed the shared doc from the DB projection ONCE, only when the fragment is still empty after the
  // first sync (F-I7 seed order: saved contentJson → initialHtml into CASE 1 → genuinely-blank doc).
  const seedIfEmpty = useCallback(() => {
    if (seededRef.current || !editor) return;
    const frag = ydoc.getXmlFragment('default');
    if (frag.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    if (initial.contentJson) {
      editor.commands.setContent(initial.contentJson as Record<string, unknown>, { emitUpdate: false });
      return;
    }
    editor.commands.setContent(blankPlancheDoc(), { emitUpdate: false });
    if (initial.initialHtml) {
      let descPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (descPos < 0 && node.type.name === 'caseDescription') descPos = pos;
      });
      if (descPos >= 0) editor.chain().insertContentAt(descPos + 1, initial.initialHtml).run();
    }
  }, [editor, ydoc, initial]);

  useEffect(() => {
    if (editor && synced) seedIfEmpty();
  }, [editor, synced, seedIfEmpty]);

  // Read-only fallback while the connection is down.
  useEffect(() => {
    editor?.setEditable(status === 'connected');
  }, [editor, status]);

  // Item 5 — paint the inline highlight for every range-anchored comment. Recomputed whenever the
  // comment list changes or the doc is (re)seeded; case-level comments carry null anchors and are skipped.
  // Guard on `editor.view` (like the placeholder effect): the editor is created before its view mounts
  // (immediatelyRender:false), and `editor.commands` throws while the view is still null.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    // Colour each highlight by the comment's MESSAGE ORDER (index in the list), matching the sidebar.
    const order = new Map(comments.map((c, i) => [c.id, i]));
    const ranges = commentRangesFrom(comments, editor.state.doc.content.size).map((r) => ({
      ...r,
      color: commentColor(order.get(r.id) ?? 0),
    }));
    editor.commands.setCommentHighlights(ranges);
  }, [editor, comments, synced]);

  // CS-15 — the live text under each comment anchor, for the sidebar "· modifié" indicator. Re-derived
  // whenever the comment set or sync changes AND on every doc `update` (local + remote), so the marker
  // tracks edits as they happen. Cheap: a handful of textBetween calls per keystroke.
  const [liveTexts, setLiveTexts] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    const derive = () => setLiveTexts(resolveCommentTexts(editor.state));
    derive();
    editor.on('update', derive);
    return () => {
      editor.off('update', derive);
    };
  }, [editor, comments, synced]);

  // CS-15 — author-only optimistic delete. Remove first, then DELETE; a 404 means it was already gone
  // (raced with the WS event) → keep it removed; a 403 / network error restores the comment + toasts.
  const deleteComment = useCallback(
    async (c: CaseCommentDto) => {
      setComments((list) => list.filter((x) => x.id !== c.id));
      try {
        await api.deleteCaseComment(pageId, c.id, assetId);
      } catch (err) {
        if ((err as { statusCode?: number })?.statusCode === 404) return;
        setComments((list) => mergeComment(list, c));
        pushToast('Impossible de supprimer le commentaire');
      }
    },
    [pageId, assetId, pushToast],
  );

  // ── Autosave (2s debounce) + typing awareness ────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!editor) return;
    setSaveState('saving');
    try {
      const res = await api.autosaveEditorDocument(
        pageId,
        {
          ydocState: encodeState(ydoc),
          contentJson: editor.getJSON() as Record<string, unknown>,
          html: editor.getHTML(),
          // Prose-only editor: `template` is no longer sent (the backend column defaults to 'prose').
        },
        assetId,
      );
      if (res.materialized) {
        setAsset((a) => a ?? { id: res.materialized!.assetId, filename: res.materialized!.filename, currentVersion: 1 });
      }
      setSaveState('saved');
    } catch {
      // Surface the failure (B-1 UX half); the next edit's debounce retries.
      setSaveState('error');
    }
  }, [editor, pageId, ydoc, assetId]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      provider?.setLocalUser('typing', true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => provider?.setLocalUser('typing', false), 1500);
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushSave(), 2000);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, flushSave, provider]);

  // Flush on unmount / tab hide so nothing is lost.
  useEffect(() => {
    const onHide = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void flushSave();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [flushSave]);

  const onVersionSaved = (updated: AssetItem) => {
    setAsset({ id: updated.id, filename: updated.filename, currentVersion: updated.currentVersion });
    pushToast('Nouvelle version enregistrée');
  };

  const typingPeer = peers.find((p) => p.typing);

  // Item 16 — the sticky comment composer needs the sidebar pinned just below the sticky header +
  // toolbar. Measure that region's height and expose it as --ep-sticky-h so the sidebar's sticky
  // `top` clears it exactly (no hardcoded guess that breaks when the toolbar wraps).
  const cardRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sticky = stickyRef.current;
    const card = cardRef.current;
    if (!sticky || !card) return;
    const apply = () => card.style.setProperty('--ep-sticky-h', `${sticky.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(sticky);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 70px' }}>
      <ConnectionBanner status={status} />
      {/* Item 1 — the card must NOT clip (no overflow:hidden), or the sticky controls get trapped in
          a non-scrolling scrollport. The whole page scrolls with the window; the header + toolbar are
          sticky (see .ep-editor-sticky) so every A4 page stays fully visible while they stay pinned. */}
      <div ref={cardRef} className="ep-editor-card" style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '6px 6px 0 var(--shadow)' }}>
        <div ref={stickyRef} className="ep-editor-sticky">
          <EditorHeader
            slug={slug}
            projectTitle={initial.project.title}
            switcherLabel={
              initial.chapter ? `Ch. ${initial.chapter.number} — ${initial.pageTitle}` : initial.pageTitle
            }
            pageId={pageId}
            saveState={saveState}
            peers={peers}
            selfColor={myColor}
            selfAvatar={account.avatar ?? null}
          />
          <RichTextToolbar
            editor={editor}
            disabled={status !== 'connected'}
            slot={
              <ToolbarExtras
                slug={slug}
                pageId={pageId}
                assetId={assetId}
                currentAsset={asset}
                onSnapshot={onVersionSaved}
                onError={pushToast}
                editor={editor}
              />
            }
          />
        </div>
        <div className="ep-editor-body" style={{ display: 'flex' }}>
          <div className="ep-editor-main" style={{ flex: 1, padding: '24px 30px', minWidth: 0, background: 'var(--card)' }}>
            {/* Prose-only editor: the planche caseBlock schema is the writing-sheet container, always
                rendered in prose form (case chrome hidden in CSS) so it reads as one rich-text page. */}
            <div className="ep-a4-sheet">
              <div className="ep-planche-canvas" style={{ fontSize: 14, lineHeight: 1.6 }}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
          <Sidebar
            comments={comments}
            typingPeer={typingPeer ?? null}
            canComment={!!asset}
            editor={editor}
            pageId={pageId}
            assetId={assetId}
            commentInputRef={commentInputRef}
            onCommentAdded={(c) => setComments((list) => mergeComment(list, c))}
            meId={account.id}
            liveTexts={liveTexts}
            onDelete={deleteComment}
          />
        </div>
      </div>
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', maxWidth: 'calc(100vw - 32px)' }}>
          {toasts.map((t) => (
            <div key={t.id} role="status" style={{ background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, boxShadow: '4px 4px 0 var(--shadow)', textAlign: 'center' }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function EditorHeader({
  slug,
  projectTitle,
  switcherLabel,
  pageId,
  saveState,
  peers,
  selfColor,
  selfAvatar,
}: {
  slug: string;
  projectTitle: string;
  switcherLabel: string;
  pageId: string;
  saveState: SaveState;
  peers: Peer[];
  selfColor: string;
  selfAvatar: string | null;
}) {
  const onlineCount = peers.length + 1; // include self
  return (
    <div className="ep-editor-header" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '3px solid var(--ink)', flexWrap: 'wrap' }}>
      <Link href={`/projet/${slug}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>‹ Projet</Link>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectTitle}</span>
      <PageSwitcher slug={slug} currentPageId={pageId} label={switcherLabel} />
      <span role="status" aria-live="polite" style={{ fontSize: 12, color: saveState === 'error' ? 'var(--accent)' : 'var(--ink2)', fontWeight: saveState === 'error' ? 700 : 500 }}>
        {saveState === 'saving'
          ? 'Enregistrement…'
          : saveState === 'saved'
            ? 'Enregistré ✓'
            : saveState === 'error'
              ? 'Échec de l’enregistrement — nouvel essai…'
              : ''}
      </span>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <AvatarDot color={selfColor} avatar={selfAvatar} />
        {peers.map((p) => (
          <AvatarDot key={p.id} color={p.color} avatar={p.avatar} shift />
        ))}
        <span style={{ fontSize: 12, color: 'var(--ink2)', marginLeft: 9, fontWeight: 700 }}>{onlineCount} en ligne</span>
      </div>
      <SharePopover pageId={pageId} />
    </div>
  );
}

// Item 17 — the header stack shows each collaborator's real avatar (from Yjs awareness), the ink ring
// tinted to their caret colour; falls back to the halftone placeholder only when there's no avatar.
function AvatarDot({ color, avatar, shift }: { color: string; avatar?: string | null; shift?: boolean }) {
  const base = {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'block',
    marginLeft: shift ? -9 : 0,
    objectFit: 'cover' as const,
  };
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" style={base} />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...base, background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px' }}
    />
  );
}

function SharePopover({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const copyLink = async () => {
    try {
      const { url } = await api.sharePage(pageId);
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* surfaced by the disabled/enabled state only */
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '2px 2px 0 var(--shadow)', fontFamily: 'inherit', minHeight: 32 }}
      >
        Partager
      </button>
      {open && (
        <div role="dialog" aria-label="Partager le scénario" style={{ position: 'absolute', top: 42, right: 0, zIndex: 30, width: 260, maxWidth: 'calc(100vw - 32px)', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 8, boxShadow: '5px 5px 0 var(--shadow)', padding: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.4 }}>Tous les membres du projet peuvent modifier ce scénario.</p>
          <button
            type="button"
            onClick={copyLink}
            style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 700, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
          >
            {copied ? 'Lien copié ✓' : 'Copier le lien'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Toolbar right-hand extras: file dropdown + version snapshot ──
function ToolbarExtras({
  slug,
  pageId,
  assetId,
  currentAsset,
  onSnapshot,
  onError,
  editor,
}: {
  slug: string;
  pageId: string;
  assetId?: string;
  currentAsset: EditorDocumentResponse['asset'];
  onSnapshot: (a: AssetItem) => void;
  onError: (msg: string) => void;
  editor: Editor | null;
}) {
  const [snapping, setSnapping] = useState(false);
  const version = currentAsset?.currentVersion ?? null;

  // Item 22 — snapshot the current draft as a new version, optionally with a note. The version endpoint
  // accepts the note; it rides onto the CS-3 AssetVersion (same note UX as the history modal).
  const snapshot = async (note?: string) => {
    if (!editor || snapping) return;
    setSnapping(true);
    try {
      const updated = await api.snapshotEditorVersion(pageId, { html: editor.getHTML(), ...(note ? { note } : {}) }, assetId);
      onSnapshot(updated);
    } catch (err) {
      onError((err as { message?: string })?.message ?? 'Impossible d’enregistrer la version');
    } finally {
      setSnapping(false);
    }
  };

  return (
    <>
      <FileDropdown slug={slug} pageId={pageId} currentAssetId={assetId} onError={onError} />
      {/* Commenting lives ONLY in the sidebar composer — no toolbar comment button (coordinator req). */}
      {version != null && (
        <>
          <span title="Version courante" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '3px 8px' }}>v{version}</span>
          <VersionSplitButton snapping={snapping} onSnapshot={snapshot} />
        </>
      )}
    </>
  );
}

// ── Item 22 — split control: primary snapshots now; the down-chevron opens an inline note form that
// snapshots WITH a note. Same note UX (optional textarea) as the CS-3 history modal. ──
function VersionSplitButton({ snapping, onSnapshot }: { snapping: boolean; onSnapshot: (note?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const submitNote = (e: React.FormEvent) => {
    e.preventDefault();
    onSnapshot(note.trim() || undefined);
    setNote('');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Split button: primary (snapshot now) + attached chevron (snapshot with a note). */}
      <button
        type="button"
        onClick={() => onSnapshot()}
        disabled={snapping}
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: '6px 0 0 6px', borderRight: 'none', padding: '4px 12px', minHeight: 32, background: 'var(--card)', cursor: snapping ? 'wait' : 'pointer', fontFamily: 'inherit' }}
      >
        {snapping ? 'Enregistrement…' : 'Enregistrer une nouvelle version'}
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ajouter une note à la version"
        onClick={() => setOpen((o) => !o)}
        disabled={snapping}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, minHeight: 32, border: '2px solid var(--ink)', borderRadius: '0 6px 6px 0', background: open ? 'var(--accent)' : 'var(--card)', color: open ? '#fff' : 'var(--ink)', cursor: snapping ? 'wait' : 'pointer', fontFamily: 'inherit' }}
      >
        <CaretDownIcon size={13} />
      </button>
      {open && (
        <form
          onSubmit={submitNote}
          role="dialog"
          aria-label="Note de version"
          style={{ position: 'absolute', top: 40, right: 0, zIndex: 30, width: 260, maxWidth: 'calc(100vw - 32px)', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 8, boxShadow: '5px 5px 0 var(--shadow)', padding: 12 }}
        >
          <label htmlFor="ep-version-note" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>NOTE (optionnelle)</label>
          <textarea
            id="ep-version-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Décrivez cette version…"
            rows={2}
            autoFocus
            style={{ width: '100%', marginTop: 4, border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', background: 'var(--card)', color: 'var(--ink)' }}
          />
          <button
            type="submit"
            disabled={snapping}
            style={{ marginTop: 8, width: '100%', background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 12px', minHeight: 36, fontSize: 12, fontWeight: 700, cursor: snapping ? 'wait' : 'pointer', fontFamily: 'inherit' }}
          >
            Enregistrer
          </button>
        </form>
      )}
    </div>
  );
}

function FileDropdown({
  slug,
  pageId,
  currentAssetId,
  onError,
}: {
  slug: string;
  pageId: string;
  currentAssetId?: string;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<AssetItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || files) return;
    Promise.all([api.listProjectAssets(slug, { type: 'scenario' }), api.listProjectAssets(slug, { type: 'texte' })])
      .then(([sc, tx]) => setFiles([...sc.items, ...tx.items]))
      .catch(() => setFiles([]));
  }, [open, files, slug]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // U4 — open a chosen file into THIS editor via the `?asset` param (open ≠ link).
  const openFile = (id: string) => {
    setOpen(false);
    if (id !== currentAssetId) router.push(`/projet/${slug}/editeur/${pageId}?asset=${encodeURIComponent(id)}`);
  };

  // U4 — in-editor import via CS-3 (presigned upload → scenario asset → link to card → open).
  const runImport = async (file: File) => {
    const invalid = validateAssetFile(file);
    if (invalid) {
      onError(invalid);
      return;
    }
    setImporting(true);
    try {
      const mediaId = await uploadAssetFile(file);
      const created = await api.createProjectAsset(slug, { mediaId, filename: file.name, type: 'scenario' });
      await api.linkAssetToPage(created.id, { pageId });
      setOpen(false);
      router.push(`/projet/${slug}/editeur/${pageId}?asset=${encodeURIComponent(created.id)}`);
    } catch (err) {
      onError((err as { message?: string })?.message ?? 'Échec de l’import. Réessayez.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 12px', minHeight: 32, background: 'var(--card)', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--ink2)', fontFamily: 'inherit' }}
      >
        <FileTextIcon size={13} /> Ouvrir un fichier ▾
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.docx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void runImport(f);
        }}
      />
      {open && (
        <div role="menu" aria-label="Charger un fichier texte" style={{ position: 'absolute', top: 36, right: 0, zIndex: 20, width: 250, maxWidth: 'calc(100vw - 32px)', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 8, boxShadow: '5px 5px 0 var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 11px', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', borderBottom: '2px solid var(--border)' }}>OUVRIR UN FICHIER TEXTE</div>
          {files === null ? (
            <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</div>
          ) : files.length === 0 ? (
            <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--ink2)' }}>Aucun fichier texte</div>
          ) : (
            files.map((f) => {
              const current = f.id === currentAssetId;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  title={f.filename}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => openFile(f.id)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 11px', minHeight: 40, borderBottom: '1.5px solid var(--border)', border: 'none', borderRadius: 0, fontWeight: current ? 700 : 500, fontSize: 13, color: 'var(--ink)', background: current ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <FileTextIcon size={13} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                  {current && <span aria-hidden="true">✓</span>}
                </button>
              );
            })
          )}
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            style={{ display: 'block', width: '100%', padding: '10px 11px', minHeight: 44, borderTop: '2px solid var(--border)', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, color: 'var(--accent)', cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            {importing ? 'Import en cours…' : '＋ Importer un fichier…'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Right sidebar: comments-only (presence lives in the header) + typing cue ──────────────
function Sidebar({
  comments,
  typingPeer,
  canComment,
  editor,
  pageId,
  assetId,
  commentInputRef,
  onCommentAdded,
  meId,
  liveTexts,
  onDelete,
}: {
  comments: CaseCommentDto[];
  typingPeer: Peer | null;
  canComment: boolean;
  editor: Editor | null;
  pageId: string;
  assetId?: string;
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onCommentAdded: (c: CaseCommentDto) => void;
  /** CS-15 — the current account id: only the author of a comment sees its trash affordance. */
  meId: string;
  /** CS-15 — live text under each comment anchor (id → text), for the "· modifié" indicator. */
  liveTexts: Map<string, string>;
  /** CS-15 — optimistic author-only delete, owned by the parent (mutates the shared comment list). */
  onDelete: (c: CaseCommentDto) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, forceRender] = useState(0);
  // CS-15 — the comment awaiting the confirm dialog, and the id whose delete is in flight (disabled trash).
  const [confirmDelete, setConfirmDelete] = useState<CaseCommentDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Item 5 — the highlighted text range the next comment will anchor to. Captured whenever the editor
  // holds a non-empty selection; cleared when the selection collapses to a caret. Persists while the
  // user types in the textarea (ProseMirror keeps its selection in state even when the DOM blurs).
  const [range, setRange] = useState<{ from: number; to: number; quote: string } | null>(null);

  // Track the caret so "case N" reflects the block the comment will anchor to, and capture a selected
  // text range for range-anchored comments (item 5).
  useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      forceRender((n) => n + 1);
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setRange(null);
      } else {
        const quote = editor.state.doc.textBetween(from, to, ' ').trim();
        setRange(quote ? { from, to, quote } : null);
      }
    };
    editor.on('selectionUpdate', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
    };
  }, [editor]);

  const currentCaseNo = caseNoAtSelection(editor);

  const submit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Le commentaire ne peut pas être vide');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.addCaseComment(
        pageId,
        currentCaseNo,
        // Item 5 — attach the range anchor when a selection is active; otherwise a case-level comment.
        range ? { text: trimmed, anchorFrom: range.from, anchorTo: range.to, quote: range.quote } : { text: trimmed },
        assetId,
      );
      onCommentAdded(created);
      setText('');
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Impossible d’ajouter le commentaire');
    } finally {
      setBusy(false);
    }
  };

  // Item 5 — "voir dans le texte": select the comment's stored range and reveal it. We do NOT use
  // PM's .scrollIntoView() here — that routes through the typing caret-band handler keyed on the
  // selection HEAD (the range END), which parks the end at ~78% and pushes the highlighted run up out
  // of view. Instead place the range START just below the sticky header so the whole highlight reads.
  const revealRange = (from: number, to: number) => {
    if (!editor) return;
    const size = editor.state.doc.content.size;
    if (from < 0 || to > size || to <= from) return;
    editor.chain().focus().setTextSelection({ from, to }).run();
    if (typeof window === 'undefined') return;
    let top: number;
    try {
      top = editor.view.coordsAtPos(from).top;
    } catch {
      return;
    }
    const target = Math.max(CARET_TOP_MARGIN + 24, window.innerHeight * 0.22); // sit clear of the header
    window.scrollTo({ top: Math.max(0, window.scrollY + (top - target)), behavior: 'smooth' });
  };

  return (
    <aside className="ep-editor-sidebar" aria-label="Commentaires" style={{ width: 256, borderLeft: '3px solid var(--ink)', background: 'var(--paper)' }}>
      {/* Item 16/28 — the aside (paper bg) stretches the full canvas height so there's no white gap;
          the INNER panel is the sticky, height-capped column that keeps the composer pinned. */}
      <div className="ep-editor-sidepanel" style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, flex: '0 0 auto' }}>Commentaires</div>

      {typingPeer && (
        <div style={{ marginBottom: 10, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: typingPeer.color, fontWeight: 700 }} aria-live="polite">
          <span style={{ display: 'flex', gap: 3 }} aria-hidden="true">
            {[0, 0.2, 0.4].map((d) => (
              <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: typingPeer.color, display: 'block', animation: `epType 1.2s infinite ${d}s` }} />
            ))}
          </span>
          {typingPeer.name} écrit…
        </div>
      )}

      {/* Item 16 — the comments list scrolls internally (flex:1) so the composer below stays pinned. */}
      <div className="ep-comments-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>Aucun commentaire</div>}
        {comments.map((c, i) => {
          // CS-15 — "· modifié": the live anchored text differs from the stored quote (whitespace-tolerant).
          // undefined = case-level comment (no anchor) → never modified. '' = the range was fully deleted.
          const current = liveTexts.get(c.id);
          const changed = c.quote != null && current !== undefined && quoteChanged(c.quote, current);
          return (
          <div key={c.id} style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 10px', fontSize: 12, background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px', border: '1.5px solid var(--ink)', display: 'block' }} />
              <b>{c.authorName}</b>
              {/* CS-15 — author-only delete. Real <button> (keyboard-operable), labelled with intent; no emoji. */}
              {c.authorId === meId && (
                <button
                  type="button"
                  aria-label="Supprimer le commentaire"
                  title="Supprimer le commentaire"
                  disabled={deletingId === c.id}
                  onClick={() => setConfirmDelete(c)}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'none', border: 'none', borderRadius: 6, padding: 0, color: 'var(--ink2)', cursor: deletingId === c.id ? 'default' : 'pointer', opacity: deletingId === c.id ? 0.5 : 1 }}
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
            {/* Item 5 — a range-anchored comment shows the quoted highlight + a jump-to-text affordance.
                Its accent shares the same order-assigned colour as the in-canvas highlight (commentColor). */}
            {c.quote && (
              <div style={{ marginBottom: 5, borderLeft: `3px solid ${commentColor(i)}`, paddingLeft: 7 }}>
                <div style={{ color: 'var(--ink2)', fontStyle: 'italic', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  « {c.quote} »
                  {/* CS-15 — the marker reads as TEXT (not colour-only) for a11y. */}
                  {changed && <span style={{ color: 'var(--ink2)', fontStyle: 'normal', fontWeight: 700, fontSize: 10 }}> · modifié</span>}
                </div>
                {/* CS-15 — the current text, only when it changed AND the range still resolves (non-empty). */}
                {changed && current !== '' && (
                  <div style={{ marginTop: 2, color: 'var(--ink2)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    maintenant : « {current} »
                  </div>
                )}
                {c.anchorFrom != null && c.anchorTo != null && (
                  <button
                    type="button"
                    onClick={() => revealRange(c.anchorFrom!, c.anchorTo!)}
                    style={{ marginTop: 3, background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
                  >
                    voir dans le texte
                  </button>
                )}
              </div>
            )}
            <div style={{ color: 'var(--ink)', lineHeight: 1.3 }}>{c.text}</div>
          </div>
          );
        })}
      </div>

      {/* Item 16 — the composer is pinned at the sidebar bottom (flex:none) while comments scroll. */}
      {canComment ? (
        <form onSubmit={submit} className="ep-comment-composer">
          <label htmlFor="ep-comment-input" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChatIcon size={12} /> {range ? 'Commenter la sélection' : 'Commentaire'}
            </span>
          </label>
          {/* Item 5 — when text is selected, preview the quoted range the comment will anchor to. */}
          {range && (
            <div style={{ marginTop: 4, borderLeft: '3px solid var(--accent)', paddingLeft: 7, fontSize: 11, fontStyle: 'italic', color: 'var(--ink2)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              « {range.quote} »
            </div>
          )}
          <textarea
            id="ep-comment-input"
            ref={commentInputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              // Enter validates the comment; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(e);
              }
            }}
            placeholder="Votre commentaire…"
            aria-label={range ? 'Commenter la sélection' : 'Ajouter un commentaire'}
            aria-invalid={!!error}
            rows={2}
            style={{ width: '100%', marginTop: 4, border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', background: 'var(--card)', color: 'var(--ink)' }}
          />
          {error && <div role="alert" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ marginTop: 6, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 12px', minHeight: 40, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ＋ Commentaire
          </button>
        </form>
      ) : (
        <p className="ep-comment-composer" style={{ fontSize: 11, color: 'var(--ink2)', fontStyle: 'italic' }}>Enregistrez d’abord le scénario pour commenter.</p>
      )}
      </div>
      {/* CS-15 — confirm before the optimistic delete; the trash is disabled while the DELETE is in flight. */}
      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer ce commentaire ?"
          confirmLabel="Supprimer"
          onConfirm={() => {
            const c = confirmDelete;
            setConfirmDelete(null);
            setDeletingId(c.id);
            void onDelete(c).finally(() => setDeletingId((id) => (id === c.id ? null : id)));
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </aside>
  );
}


function ConnectionBanner({ status }: { status: CollabStatus }) {
  if (status === 'connected') return null;
  return (
    <div role="status" aria-live="polite" style={{ marginBottom: 12, background: 'var(--accent-soft)', border: '2px solid var(--ink)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
      {status === 'connecting' ? 'Connexion…' : 'Reconnexion en cours — lecture seule'}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

// F-I3.3 — custom caret DOM matching the default CollaborationCaret markup, plus an accessible name
// so a collaborator's cursor announces its author (QA finding 4 / round-1 F4 commitment).
function caretRender(user: Record<string, unknown>): HTMLElement {
  const name = String(user.name ?? 'Collaborateur');
  const color = String(user.color ?? 'var(--accent)');
  const cursor = document.createElement('span');
  cursor.classList.add('collaboration-carets__caret');
  cursor.setAttribute('style', `border-color: ${color}`);
  cursor.setAttribute('role', 'img');
  cursor.setAttribute('aria-label', `Curseur de ${name}`);
  const label = document.createElement('div');
  label.classList.add('collaboration-carets__label');
  label.setAttribute('style', `background-color: ${color}`);
  label.insertBefore(document.createTextNode(name), null);
  cursor.insertBefore(label, null);
  return cursor;
}

// Word-like caret scrolling. The camera reacts to the caret changing LINE, never to typing on the
// current line: appending a character (or deleting one) leaves the caret on the same visual line, so
// its absolute document Y is unchanged and we do nothing — the view never shifts on char input, even
// when the caret rests at the very bottom of the window. Only when the caret moves to a new line (a
// newline, arrow key, wrap, or reflow that relocates it) do we check whether it left the comfortable
// band: dropped below the bottom edge → scroll down and re-anchor with runway (~72% of the window, so
// several fresh lines follow before the next scroll); slipped behind the sticky header → scroll up
// just enough to clear it. `window.scrollTo` clamps to [0, maxScroll]. Single editor per page load, so
// a module-level "last line Y" is enough (resets on navigation).
const CARET_TOP_MARGIN = 180; // px kept clear at the top for the sticky header + toolbar
const CARET_BOTTOM_MARGIN = 24; // px kept clear at the bottom edge so the caret line never touches 100vh
const CARET_REANCHOR = 0.72; // on a downward scroll, land the caret this far down (runway for more lines)
let lastCaretDocY: number | null = null; // absolute (scroll-independent) Y of the caret's last line
function scrollCaretIntoView(view: { state: { selection: { head: number } }; coordsAtPos: (pos: number) => { top: number; bottom: number } }): boolean {
  if (typeof window === 'undefined') return false;
  let coords: { top: number; bottom: number };
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return false; // let PM fall back to its default if the position can't be measured
  }
  // Absolute document Y of the caret line — unchanged while typing on the same line, so char input is
  // a no-op (the core of "don't shift on character input, only on newline").
  const docY = Math.round(coords.top + window.scrollY);
  if (lastCaretDocY !== null && Math.abs(docY - lastCaretDocY) < 2) return true;
  lastCaretDocY = docY;
  let delta = 0;
  if (coords.bottom > window.innerHeight - CARET_BOTTOM_MARGIN) {
    delta = coords.bottom - window.innerHeight * CARET_REANCHOR; // caret dropped to a new line off the bottom → scroll, land at 72%
  } else if (coords.top < CARET_TOP_MARGIN) {
    delta = coords.top - CARET_TOP_MARGIN; // caret behind the chrome → scroll up just enough to clear it
  }
  if (delta !== 0) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'auto' });
  return true; // we own scroll-to-selection (suppresses PM's abrupt edge jump when already in view)
}

function encodeState(ydoc: Y.Doc): string {
  const u = Y.encodeStateAsUpdate(ydoc);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

// Inverse of encodeState — decode a base64 Yjs update (from the initial GET) into bytes.
function decodeState(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// B-2 — self-exclusion keys off the Yjs awareness clientID (stable), NOT user.id which
// @tiptap/extension-collaboration-caret clobbers to { name, color } on mount.
// Reload dedup — on reload the browser gets a NEW clientID, but the previous connection's awareness
// state can linger (server relays it before it's GC'd), so the OLD "you" arrives as a peer with the
// same account id → a duplicate avatar + inflated count. Exclude any state whose user.id is the local
// account, and collapse multiple connections of one account to a single avatar (dedupe by user.id).
function readPeers(provider: EditorCollabProvider, selfUserId: string): Peer[] {
  const byUser = new Map<string, Peer>();
  const selfClientId = provider.awareness.clientID;
  provider.awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfClientId) return;
    const s = state as Partial<EditorAwarenessState>;
    if (!s.user) return;
    const uid = s.user.id ?? String(clientId);
    if (uid === selfUserId) return; // a ghost of myself from a previous connection (reload)
    if (byUser.has(uid)) return; // one avatar per account, even across connections
    byUser.set(uid, {
      id: uid,
      name: s.user.name ?? 'Collaborateur',
      color: s.user.color ?? '#888',
      role: s.user.role ?? 'pen',
      typing: !!s.typing,
      avatar: s.user.avatar ?? null,
    });
  });
  return [...byUser.values()];
}

function mergeComment(list: CaseCommentDto[], c: CaseCommentDto): CaseCommentDto[] {
  return list.some((x) => x.id === c.id) ? list : [...list, c];
}

// The case number containing the caret; falls back to 1 for a fresh doc.
function caseNoAtSelection(editor: Editor | null): number {
  if (!editor) return 1;
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'caseBlock') return Number(node.attrs.no) || 1;
  }
  return 1;
}
