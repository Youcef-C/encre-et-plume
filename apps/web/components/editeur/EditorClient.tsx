'use client';

// CS-4 — collaborative script editor "Éditeur". Replica of prototype `data-page="editeur"` (header,
// toolbar, planche/case A4 canvas, right sidebar). Real wiring: TipTap v3 + Yjs over the /editor WS
// namespace, explicit content save (« Enregistrer » / Ctrl+S — FR9, no autosave), explicit version
// snapshots («Enregistrer une nouvelle version»), per-case comments,
// live presence + named colored carets + typing. Iter 2: StrictMode-safe provider lifecycle,
// clientID-keyed presence, fuller toolbar, A4 sheet, working file open/import, chapter/page switcher.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as Y from 'yjs';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import {
  COLLAB_COLORS,
  CORRECTION_STATUS_LABELS,
  type CorrectionStatus,
  type EditorDocumentResponse,
  type CaseCommentDto,
  type EditorAwarenessState,
  type AssetItem,
  type AssetVersionItem,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { useFetchState } from '../../lib/useFetchState';
import { uploadAssetFile, validateAssetFile } from '../../lib/assetUpload';
import { EditorCollabProvider, type CollabStatus } from '../../lib/editor-collab';
import { buildRichTextExtensions } from '../editor/richtext/core';
import { plancheExtensions, blankPlancheDoc, casePlaceholder } from '../editor/richtext/planche-schema';
import { commentRangesFrom, commentColor, resolveCommentTexts, resolveCommentRange, quoteChanged, encodeCommentAnchor } from '../editor/richtext/comment-highlight';
import RichTextToolbar from '../editor/richtext/RichTextToolbar';
import PageSwitcher from './PageSwitcher';
import VersionSheet from './VersionSheet';
import CompareVersionsModal from './CompareVersionsModal';
import ConfirmDialog from '../projet/ConfirmDialog';
import OnBrandSelect from '../form/OnBrandSelect';
import { NEXT_STATUS } from '../revision/shared';
import { FileTextIcon, ChatIcon, CaretDownIcon, TrashIcon, CompareIcon, CheckIcon } from '../icons';

// CS-5 Fb-2 — a comment row's «Correction» tag colours: accent for open, green for resolved.
const CORRECTION_TAG_GREEN = '#1f8a5b';

const colorForId = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLLAB_COLORS[h % COLLAB_COLORS.length];
};

// CS-21 — the idle window before the client compacts. ~5s: long enough that a normal typing burst is
// one request, short enough that a crashed tab leaves only seconds of update log behind (and the F-8
// `scenario-compaction` job sweeps up whatever it still leaves).
const COMPACT_IDLE_MS = 5000;

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

  // DR-14: the shared hook owns the load — a transient failure keeps the skeleton and retries, so
  // "Éditeur indisponible" is reached only on a terminal 4xx (no page / no access).
  const canLoad = !sessionLoading && !!account;
  const feed = useFetchState(
    () => (canLoad ? api.getEditorDocument(pageId, assetId ?? undefined) : Promise.resolve(null)),
    [pageId, assetId, account?.id, canLoad],
  );
  const doc: EditorDocumentResponse | null = feed.data;
  const loadState = feed.state;

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
    if (sessionLoading || account) return;
    const next = `/projet/${slug}/editeur/${pageId}${assetId ? `?asset=${assetId}` : ''}`;
    router.replace(`/connexion?next=${encodeURIComponent(next)}`);
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

  // Fb-8 — key on the account id too: if the session identity changes (shared cookie jar / focus
  // revalidation in session.tsx), remount so awareness/meId/attribution pick up the acting account.
  return <EditorLoaded key={`${pageId}:${assetId ?? ''}:${account.id}`} pageId={pageId} slug={slug} assetId={assetId ?? undefined} initial={doc} account={account} />;
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
  // CS-5 QA F1 / FR7 — the scenario document id, reactive: a same-session autosave materializes the doc
  // and returns its id, so "Demander une correction" enables without a page reload.
  const [documentId, setDocumentId] = useState(initial.documentId);
  // CS-5 Fb-5 — in-editor version switcher: the asset's versions, the version being viewed (null = live
  // head / normal editing), and the read-only HTML fetched for an older version.
  const [versions, setVersions] = useState<AssetVersionItem[]>([]);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [viewHtml, setViewHtml] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  // CS-5 — deep-link from the review screen: `?from=&to=` selects and reveals that scenario range.
  const searchParams = useSearchParams();
  const deepLink = useMemo(() => {
    const f = Number(searchParams.get('from'));
    const t = Number(searchParams.get('to'));
    return Number.isInteger(f) && Number.isInteger(t) && t > f ? { from: f, to: t } : null;
  }, [searchParams]);
  // CS-21 — persistence is background compaction, not a user action: the only UI state left is
  // "a request is in flight". No `dirty`: in a collaborative editor the edits are already shared and
  // already durable before any button could be pressed, so "unsaved" was a lie.
  const [compacting, setCompacting] = useState(false);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [synced, setSynced] = useState(false);
  // CS-10 — the group « Écriture » permission, shipped on the sync payload. Undefined (an older
  // server) is treated as writable; the server drops a read-only socket's updates regardless.
  const [canWrite, setCanWrite] = useState(true);
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
  // CS-21 — the idle-compaction debounce, the live `compact` callback (so the unmount/hide flush never
  // fires a stale closure), and the consecutive-failure counter behind the toast.
  const compactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compactRef = useRef<() => Promise<void>>(async () => {});
  const failuresRef = useRef(0);
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
        onSync: (p) => {
          setSynced(true);
          setCanWrite(p?.canWrite !== false);
        },
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

  // Read-only fallback while the connection is down, or when CS-10 denies the « Écriture » permission.
  useEffect(() => {
    editor?.setEditable(status === 'connected' && canWrite);
  }, [editor, status, canWrite]);

  // Item 5 — paint the inline highlight for every range-anchored comment. Recomputed whenever the
  // comment list changes or the doc is (re)seeded; case-level comments carry null anchors and are skipped.
  // Guard on `editor.view` (like the placeholder effect): the editor is created before its view mounts
  // (immediatelyRender:false), and `editor.commands` throws while the view is still null.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.view) return;
    // Colour each highlight by the comment's MESSAGE ORDER (index in the FULL list), matching the sidebar.
    // FR15 (r4) — one plain list: paint every comment (no per-version scoping). FR14 — flag correction
    // comments so their highlight is tagged (`ep-correction-highlight`) distinctly from a plain comment.
    const order = new Map(comments.map((c, i) => [c.id, i]));
    const correctionOf = new Map(comments.map((c) => [c.id, !!c.correction]));
    const ranges = commentRangesFrom(comments, editor.state.doc.content.size).map((r) => ({
      ...r,
      color: commentColor(order.get(r.id) ?? 0),
      correction: correctionOf.get(r.id) ?? false,
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

  // CS-5 r4 (FR14) — step a scenario correction's status from the editor comment panel (the revision
  // page is dessin-only now, so scenario corrections are managed here). Author/assignee-only in the UI;
  // the server re-enforces on PATCH /corrections/:id. No optimistic flip — reflect only the response.
  const changeCorrectionStatus = useCallback(
    async (c: CaseCommentDto, status: CorrectionStatus) => {
      if (!c.correction) return;
      try {
        const updated = await api.updateCorrection(c.correction.id, { status });
        setComments((list) =>
          list.map((x) => (x.id === c.id && x.correction ? { ...x, correction: { ...x.correction, status: updated.status } } : x)),
        );
      } catch {
        pushToast('Changement de statut refusé.');
      }
    },
    [pushToast],
  );

  // ── CS-21 — compaction. Same endpoint, same payload as the old « Enregistrer »; only the trigger
  // changed (idle tick / hide / unmount instead of a button). It folds the live CRDT update log into
  // ScenarioDocument.ydocState; it does NOT create an AssetVersion — « Enregistrer une nouvelle
  // version » stays the only version-creating action, and now carries all the ceremony.
  const compact = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;
    // CS-10 — no « Écriture » permission: the server 403s this route, so don't even ask (the button
    // is disabled too; this also covers the Ctrl/Cmd-S path). UX only — the gate is server-side.
    if (!canWrite) return;
    const html = editor.getHTML();
    // Bug (scenario version off-by-one) — never persist a blank document. An empty first Save would
    // materialize an EMPTY v1 (the reported v1=empty / v1==v2 shift), and an on-mount/early Ctrl+S could
    // race the imported content before it seeds. Mirror the server's isBlankHtml and no-op silently (the
    // server guards this too, but suppressing the request means the empty save never even tries).
    if (isBlankHtml(html)) return;
    setCompacting(true);
    try {
      const res = await api.autosaveEditorDocument(
        pageId,
        {
          ydocState: encodeState(ydoc),
          contentJson: editor.getJSON() as Record<string, unknown>,
          html,
          // Prose-only editor: `template` is no longer sent (the backend column defaults to 'prose').
        },
        // Bug (off-by-one) — target the OPENED/loaded asset so an imported or ?asset-opened file is
        // edited IN PLACE (server resolveEditorAsset) instead of materializing a duplicate / wrong-target
        // version; fall back to the ?asset URL param, then to none (create-when-none for a brand-new page).
        asset?.id ?? assetId,
      );
      if (res.materialized) {
        setAsset((a) => a ?? { id: res.materialized!.assetId, filename: res.materialized!.filename, currentVersion: 1 });
        // FR7 — capture the freshly materialized document id so "Demander une correction" works now.
        setDocumentId((d) => d ?? res.materialized!.documentId);
      }
      failuresRef.current = 0;
    } catch {
      // F5 — a failed compaction loses nothing: the updates are still in Postgres and the next tick
      // retries. Stay silent on the first failure; only a SECOND consecutive one is worth a word.
      failuresRef.current += 1;
      if (failuresRef.current === 2) pushToast('L’enregistrement continu a échoué. Vos modifications restent partagées.');
    } finally {
      setCompacting(false);
    }
  }, [editor, pageId, ydoc, asset, assetId, canWrite, pushToast]);

  // The flush paths (hide, unmount) must call the CURRENT compact, not the one captured when the
  // listener was attached — hence the ref rather than re-subscribing on every dependency change.
  useEffect(() => {
    compactRef.current = compact;
  }, [compact]);

  /** Restart the idle window. Called on every editor `update`, local or remote. */
  const scheduleCompaction = useCallback(() => {
    if (compactTimer.current) clearTimeout(compactTimer.current);
    compactTimer.current = setTimeout(() => {
      compactTimer.current = null;
      void compactRef.current();
    }, COMPACT_IDLE_MS);
  }, []);

  /** Compact NOW if a tick is pending — a closing tab compacts rather than leaving a long update log. */
  const flushCompaction = useCallback(() => {
    if (!compactTimer.current) return;
    clearTimeout(compactTimer.current);
    compactTimer.current = null;
    void compactRef.current();
  }, []);

  // Typing awareness + the compaction tick. `update` fires on local AND remote edits; either leaves
  // pending ScenarioUpdate rows worth folding in, so both restart the idle window.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      provider?.setLocalUser('typing', true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => provider?.setLocalUser('typing', false), 1500);
      scheduleCompaction();
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, provider, scheduleCompaction]);

  useEffect(() => () => { if (typingTimer.current) clearTimeout(typingTimer.current); }, []);

  // CS-21 — flush on hide and on unmount. No `beforeunload` prompt: there is nothing to warn about,
  // the edits are already shared and already in Postgres. `visibilitychange` is the reliable mobile
  // signal (`beforeunload` never fires on iOS); the unmount cleanup covers an in-app route change.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushCompaction();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flushCompaction();
    };
  }, [flushCompaction]);

  const onVersionSaved = (updated: AssetItem) => {
    // Fb-6 — the server no-ops an identical snapshot (returns the unchanged head). Detect that (the
    // version didn't advance) and tell the user nothing was saved instead of a false "new version" toast.
    const unchanged = asset != null && updated.currentVersion === asset.currentVersion;
    setAsset({ id: updated.id, filename: updated.filename, currentVersion: updated.currentVersion });
    pushToast(unchanged ? `Aucune modification depuis la v${updated.currentVersion}` : 'Nouvelle version enregistrée');
  };

  // Fb-5 — load the asset's version list (for the switcher), refreshed when the head advances.
  useEffect(() => {
    if (!asset) {
      setVersions([]);
      return;
    }
    let alive = true;
    api
      .getAssetVersions(asset.id)
      .then((v) => alive && setVersions(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset]);

  // Fb-5 — switch the viewed version. Head (or null) → live editing; an older version → fetch its HTML
  // via the existing review endpoint (from=to=v) and render it read-only (no Yjs binding to a snapshot).
  const onSelectVersion = useCallback(
    async (v: number | null) => {
      if (!asset || v == null || v === asset.currentVersion) {
        setViewVersion(null);
        setViewHtml(null);
        return;
      }
      setViewVersion(v);
      setViewLoading(true);
      try {
        const review = await api.getReview(pageId, { file: asset.id, from: v, to: v });
        setViewHtml(review.selected?.fromHtml ?? null);
      } catch {
        setViewHtml(null);
      } finally {
        setViewLoading(false);
      }
    },
    [asset, pageId],
  );
  const backToLive = () => {
    setViewVersion(null);
    setViewHtml(null);
  };
  const restoreIntoDraft = () => {
    if (viewHtml != null && editor) editor.commands.setContent(viewHtml);
    // CS-21 — restoring replaces the live draft, so it earns a compaction tick (setContent fires
    // `update` in the real editor; schedule it here too so the path is deterministic).
    scheduleCompaction();
    backToLive();
    pushToast('Version restaurée dans le brouillon');
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
            compacting={compacting}
            status={status}
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
                canWrite={canWrite}
                versions={versions}
                viewVersion={viewVersion}
                onSelectVersion={onSelectVersion}
              />
            }
          />
        </div>
        <div className="ep-editor-body" style={{ display: 'flex' }}>
          <div className="ep-editor-main" style={{ flex: 1, padding: '24px 30px', minWidth: 0, background: 'var(--card)' }}>
            {/* Prose-only editor: the planche caseBlock schema is the writing-sheet container, always
                rendered in prose form (case chrome hidden in CSS) so it reads as one rich-text page.
                Fb-5 — viewing an older version replaces the live editor with a read-only snapshot. */}
            {viewVersion != null ? (
              <div className="ep-a4-sheet">
                <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, background: 'var(--accent-soft)', border: '2px solid var(--ink)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  <span>Lecture seule — v{viewVersion}</span>
                  <button type="button" onClick={backToLive} style={{ border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 10px', minHeight: 32, background: 'var(--card)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                    Revenir à la version actuelle
                  </button>
                  <button type="button" onClick={restoreIntoDraft} disabled={viewLoading || viewHtml == null} style={{ border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 10px', minHeight: 32, background: viewLoading || viewHtml == null ? 'var(--tone)' : 'var(--accent)', color: viewLoading || viewHtml == null ? 'var(--ink2)' : '#fff', fontSize: 12, fontWeight: 700, cursor: viewLoading || viewHtml == null ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    Restaurer dans le brouillon
                  </button>
                </div>
                {viewLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Chargement de la version…</div>
                ) : viewHtml == null ? (
                  <div style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>Aperçu indisponible pour cette version.</div>
                ) : (
                  <VersionSheet html={viewHtml} />
                )}
              </div>
            ) : (
              <div className="ep-a4-sheet">
                {/* CS-10 — a member without the group « Écriture » permission reads but never writes. */}
                {!canWrite && (
                  <div
                    role="status"
                    style={{
                      marginBottom: 14,
                      background: 'var(--accent-soft)',
                      border: '2px solid var(--ink)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--ink)',
                    }}
                  >
                    Lecture seule — vous n&apos;avez pas la permission d&apos;écriture.
                  </div>
                )}
                <div className="ep-planche-canvas" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  <EditorContent editor={editor} />
                </div>
              </div>
            )}
          </div>
          <Sidebar
            comments={comments}
            typingPeer={typingPeer ?? null}
            canComment={!!asset}
            editor={editor}
            pageId={pageId}
            documentId={documentId}
            assetId={assetId}
            deepLink={deepLink}
            commentInputRef={commentInputRef}
            onCommentAdded={(c) => setComments((list) => mergeComment(list, c))}
            meId={account.id}
            liveTexts={liveTexts}
            onDelete={deleteComment}
            onCorrectionStatus={changeCorrectionStatus}
            notify={pushToast}
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
  compacting,
  status,
  peers,
  selfColor,
  selfAvatar,
}: {
  slug: string;
  projectTitle: string;
  switcherLabel: string;
  pageId: string;
  compacting: boolean;
  status: CollabStatus;
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
      {/* CS-21 — the prototype's passive « Enregistré » slot, in the same place, reporting instead of
          asking. Never a button: there is nothing left to press. */}
      <PersistenceStatus compacting={compacting} status={status} />
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

/**
 * CS-21 — the one persistence indicator in the header. Connection state and persistence state are one
 * story to the user, so the collab status wins over everything: offline means the edits are queued
 * locally and will replay, which matters more than whether a compaction is mid-flight.
 *
 * Reports, never asks. It is a `role="status"` span; it has no `onClick`, no button role, no tick
 * glyph (check marks are pictograms in this codebase, and here the word alone says it).
 * F6 — it truncates rather than wrapping the header: `min-width:0` + ellipsis, full text on `title`.
 */
function PersistenceStatus({ compacting, status }: { compacting: boolean; status: CollabStatus }) {
  const offline = status !== 'connected';
  const label = offline
    ? 'Hors ligne — les modifications reprendront à la reconnexion'
    : compacting
      ? 'Enregistrement…'
      : 'Enregistré';
  return (
    <span
      role="status"
      aria-live="polite"
      title={label}
      style={{
        fontSize: 12,
        color: offline ? 'var(--accent)' : 'var(--ink2)',
        fontWeight: offline ? 700 : 500,
        flex: '0 1 auto',
        minWidth: 0,
        maxWidth: 'min(300px, 100%)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
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
            {copied ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                Lien copié
                <CheckIcon size={13} />
              </span>
            ) : (
              'Copier le lien'
            )}
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
  canWrite,
  versions,
  viewVersion,
  onSelectVersion,
}: {
  slug: string;
  pageId: string;
  assetId?: string;
  currentAsset: EditorDocumentResponse['asset'];
  onSnapshot: (a: AssetItem) => void;
  onError: (msg: string) => void;
  editor: Editor | null;
  canWrite: boolean;
  versions: AssetVersionItem[];
  viewVersion: number | null;
  onSelectVersion: (v: number | null) => void;
}) {
  const [snapping, setSnapping] = useState(false);
  const [comparing, setComparing] = useState(false);
  // Item 1 (iter 5) — the reviewable asset id for the compare modal. Use the loaded asset's own id
  // (the `assetId` prop is only the optional URL param and is absent for a page's default asset).
  const compareAssetId = currentAsset?.id;
  // Fb-6 (client half) — a ref-based in-flight guard: `snapping` state races a double-click (two POSTs
  // fire before the re-render disables the button). The ref flips synchronously so the second click is
  // dropped; the server-side dedupe is the ultimate authority, this just avoids the wasted round-trip.
  const snappingRef = useRef(false);
  const version = currentAsset?.currentVersion ?? null;

  // Item 22 — snapshot the current draft as a new version, optionally with a note. The version endpoint
  // accepts the note; it rides onto the CS-3 AssetVersion (same note UX as the history modal).
  const snapshot = async (note?: string) => {
    if (!editor || snappingRef.current) return;
    if (!canWrite) return; // CS-10 (F16-R3) — the route 403s without « Écriture »; don't dead-end on it
    snappingRef.current = true;
    setSnapping(true);
    try {
      // Bug (off-by-one) — snapshot the OPENED/loaded asset in place (fall back to the ?asset URL param)
      // so "Enregistrer une nouvelle version" versions the right file instead of a materialized duplicate.
      const updated = await api.snapshotEditorVersion(pageId, { html: editor.getHTML(), ...(note ? { note } : {}) }, currentAsset?.id ?? assetId);
      onSnapshot(updated);
    } catch (err) {
      onError((err as { message?: string })?.message ?? 'Impossible d’enregistrer la version');
    } finally {
      snappingRef.current = false;
      setSnapping(false);
    }
  };

  // Fb-5 — versions for the switcher (head first); fall back to the head-only entry before they load.
  const switcherOptions = versions.length > 0 ? [...versions].sort((a, b) => b.version - a.version) : version != null ? [{ version, note: null } as Pick<AssetVersionItem, 'version' | 'note'>] : [];

  return (
    <>
      <FileDropdown slug={slug} pageId={pageId} currentAssetId={assetId} onError={onError} />
      {/* Commenting lives ONLY in the sidebar composer — no toolbar comment button (coordinator req).
          FR9 Save now lives in the header next to the chapter switcher (Item 2, iter 5). */}
      {version != null && (
        <>
          {/* Fb-5 — version switcher: head = live editing, an older version = read-only view. */}
          <div style={{ minWidth: 120 }}>
            <OnBrandSelect
              aria-label="Version affichée"
              value={String(viewVersion ?? version)}
              onChange={(e) => onSelectVersion(Number(e.target.value))}
            >
              {switcherOptions.map((v) => (
                <option key={v.version} value={String(v.version)}>
                  {`v${v.version}${v.note ? ` · ${v.note}` : ''}`}
                </option>
              ))}
            </OnBrandSelect>
          </div>
          {/* Item 1 (iter 5) — compare two scenario versions side by side (A4 sheet) in a modal. */}
          {versions.length >= 2 && compareAssetId && (
            <button
              type="button"
              onClick={() => setComparing(true)}
              title="Comparer les versions"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 10px', minHeight: 32, background: 'var(--card)', color: 'var(--ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <CompareIcon size={15} />
              Comparer
            </button>
          )}
          <VersionSplitButton snapping={snapping} onSnapshot={snapshot} canWrite={canWrite} />
        </>
      )}
      {comparing && compareAssetId && version != null && (
        <CompareVersionsModal
          pageId={pageId}
          assetId={compareAssetId}
          versions={versions}
          headVersion={version}
          onClose={() => setComparing(false)}
        />
      )}
      {/* FR1 mirror — cross-link to the review screen (the review toolbar links back to the editor). */}
      <Link href={`/projet/${slug}/revision/${pageId}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none', border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 10px', minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>
        Révision · corrections →
      </Link>
    </>
  );
}

// ── Item 22 — split control: primary snapshots now; the down-chevron opens an inline note form that
// snapshots WITH a note. Same note UX (optional textarea) as the CS-3 history modal. ──
function VersionSplitButton({ snapping, onSnapshot, canWrite }: { snapping: boolean; onSnapshot: (note?: string) => void; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  // CS-10 (F16-R3) — without « Écriture » the version route 403s: disable both halves of the split.
  const blocked = snapping || !canWrite;
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
        disabled={blocked}
        title={canWrite ? undefined : 'Lecture seule — permission « Écriture » requise'}
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: '6px 0 0 6px', borderRight: 'none', padding: '4px 12px', minHeight: 32, background: 'var(--card)', cursor: snapping ? 'wait' : canWrite ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
      >
        {snapping ? 'Enregistrement…' : 'Enregistrer une nouvelle version'}
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ajouter une note à la version"
        onClick={() => setOpen((o) => !o)}
        disabled={blocked}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, minHeight: 32, border: '2px solid var(--ink)', borderRadius: '0 6px 6px 0', background: open ? 'var(--accent)' : 'var(--card)', color: open ? '#fff' : 'var(--ink)', cursor: snapping ? 'wait' : canWrite ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
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
                  {current && <CheckIcon size={13} />}
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
  documentId,
  assetId,
  deepLink,
  commentInputRef,
  onCommentAdded,
  meId,
  liveTexts,
  onDelete,
  onCorrectionStatus,
  notify,
}: {
  comments: CaseCommentDto[];
  typingPeer: Peer | null;
  canComment: boolean;
  editor: Editor | null;
  pageId: string;
  /** CS-5 — the scenario document id (null before first autosave materializes it). */
  documentId: string | null;
  assetId?: string;
  /** CS-5 — deep-link range from the review screen; revealed once the editor is ready. */
  deepLink: { from: number; to: number } | null;
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onCommentAdded: (c: CaseCommentDto) => void;
  /** CS-15 — the current account id: only the author of a comment sees its trash affordance. */
  meId: string;
  /** CS-15 — live text under each comment anchor (id → text), for the "· modifié" indicator. */
  liveTexts: Map<string, string>;
  /** CS-15 — optimistic author-only delete, owned by the parent (mutates the shared comment list). */
  onDelete: (c: CaseCommentDto) => Promise<void>;
  /** CS-5 r4 (FR14) — step a correction-comment's status; author/assignee-only (server re-enforced). */
  onCorrectionStatus: (c: CaseCommentDto, status: CorrectionStatus) => Promise<void>;
  /** Toast seam owned by the parent (correction-filed confirmation). */
  notify: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // CS-5 — "Demander une correction" (scenario): busy while the request is in flight.
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [, forceRender] = useState(0);

  // CS-15 — the comment awaiting the confirm dialog, and the id whose delete is in flight (disabled trash).
  const [confirmDelete, setConfirmDelete] = useState<CaseCommentDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // CS-5 r4 (FR14) — the correction whose status change is in flight (one guard per row, no optimism).
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  // Item 5 — the highlighted text range the next comment will anchor to. Captured whenever the editor
  // holds a non-empty selection; cleared when the selection collapses to a caret. Persists while the
  // user types in the textarea (ProseMirror keeps its selection in state even when the DOM blurs).
  // CS-22 — the range also carries the DURABLE anchor (base64 Yjs relative positions), encoded at
  // capture time: that is the one moment the absolute pair is provably correct. Encoding later, at
  // submit, would re-derive it from numbers a peer's edit may already have invalidated.
  const [range, setRange] = useState<{ from: number; to: number; quote: string; relFrom?: string; relTo?: string } | null>(null);

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
        const rel = encodeCommentAnchor(editor.state, from, to); // null until the Yjs binding is ready
        setRange(quote ? { from, to, quote, ...(rel ?? {}) } : null);
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
        range
          ? {
              text: trimmed,
              anchorFrom: range.from,
              anchorTo: range.to,
              quote: range.quote,
              // CS-22 — the durable pair rides along; omitted when the binding wasn't ready (server
              // then keeps today's absolute-only row and the client falls back to it on load).
              ...(range.relFrom && range.relTo ? { anchorRelFrom: range.relFrom, anchorRelTo: range.relTo } : {}),
            }
          : { text: trimmed },
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

  // CS-5 — "Demander une correction": create a scenario Correction reusing the comment text-anchor.
  // Sibling of "Commenter la sélection"; requires an active selection + a materialized documentId.
  const requestCorrection = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Décrivez la correction demandée');
      return;
    }
    if (!range || !documentId) {
      setError('Sélectionnez le passage à corriger');
      return;
    }
    setCorrectionBusy(true);
    setError(null);
    try {
      // Fb-2 — one write path: the server creates a tagged ScenarioComment + Correction and fans the
      // comment out over the existing `editor:comment` WS event, so it appears here as a highlighted
      // sidebar row (with a «Correction» tag) exactly like a normal comment — no parallel control.
      await api.createCorrection(pageId, {
        type: 'scenario',
        // CS-22 — same durable pair: the server writes it onto the correction's backing comment, so the
        // correction highlight survives a reload too (its block clamp is applied on render, unchanged).
        anchor: { documentId, from: range.from, to: range.to, quote: range.quote, ...(range.relFrom && range.relTo ? { relFrom: range.relFrom, relTo: range.relTo } : {}) },
        description: trimmed,
        caseNo: currentCaseNo,
        caseRef: `case ${currentCaseNo}`,
      });
      setText('');
      notify('Demande de correction envoyée — suivez-la dans Révision · corrections');
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Impossible d’envoyer la demande de correction');
    } finally {
      setCorrectionBusy(false);
    }
  };

  // Item 5 — "voir dans le texte": select the comment's stored range and reveal it. We do NOT use
  // PM's .scrollIntoView() here — that routes through the typing caret-band handler keyed on the
  // selection HEAD (the range END), which parks the end at ~78% and pushes the highlighted run up out
  // of view. Instead place the range START just below the sticky header so the whole highlight reads.
  // CS-22 follow-up — jump through the DURABLE anchor when the editor has one for this comment, and
  // only fall back to the stored (drifted) absolute pair when it doesn't: a legacy row, or a binding
  // that isn't ready. Otherwise « voir dans le texte » selects different words than the highlight paints.
  const revealComment = (c: CaseCommentDto) => {
    if (!editor) return;
    const live = resolveCommentRange(editor.state, c.id);
    if (live) return revealRange(live.from, live.to);
    if (c.anchorFrom != null && c.anchorTo != null) revealRange(c.anchorFrom, c.anchorTo);
  };

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

  // CS-5 — reveal the deep-linked range once the editor is ready (best-effort, same caveat as comments).
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!editor || !deepLink || deepLinkDone.current) return;
    deepLinkDone.current = true;
    revealRange(deepLink.from, deepLink.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, deepLink]);

  // Stable colour ordering from the comment list (matches the in-canvas highlight order).
  const order = new Map(comments.map((c, i) => [c.id, i]));

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
        {comments.map((c) => {
          const i = order.get(c.id) ?? 0;
          // FR14 — the author or assignee of a correction-comment can step its status from here.
          const canStatus = c.correction != null && (c.authorId === meId || c.correction.assigneeId === meId);
          // CS-15 — "· modifié": the live anchored text differs from the stored quote (whitespace-tolerant).
          // undefined = case-level comment (no anchor) → never modified. '' = the range was fully deleted.
          const current = liveTexts.get(c.id);
          const changed = c.quote != null && current !== undefined && quoteChanged(c.quote, current);
          return (
          <div key={c.id} style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 10px', fontSize: 12, background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px', border: '1.5px solid var(--ink)', display: 'block' }} />
              <b>{c.authorName}</b>
              {/* Fb-2 — a tagged correction comment carries a «Correction» chip + its current status. */}
              {c.correction && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    border: `1.5px solid ${c.correction.status === 'corrige' ? CORRECTION_TAG_GREEN : 'var(--accent)'}`,
                    color: c.correction.status === 'corrige' ? CORRECTION_TAG_GREEN : 'var(--accent)',
                  }}
                >
                  Correction · {CORRECTION_STATUS_LABELS[c.correction.status]}
                </span>
              )}
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
                    onClick={() => revealComment(c)}
                    style={{ marginTop: 3, background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
                  >
                    voir dans le texte
                  </button>
                )}
              </div>
            )}
            <div style={{ color: 'var(--ink)', lineHeight: 1.3 }}>{c.text}</div>
            {/* FR14 — author/assignee-only correction status stepper (à corriger → en cours → corrigé →
                reopen). Persists via PATCH /corrections/:id; the server re-enforces the authz. */}
            {canStatus && c.correction && (
              <button
                type="button"
                disabled={statusBusyId === c.id}
                onClick={() => {
                  setStatusBusyId(c.id);
                  void onCorrectionStatus(c, NEXT_STATUS[c.correction!.status]).finally(() =>
                    setStatusBusyId((id) => (id === c.id ? null : id)),
                  );
                }}
                aria-label={`Statut de la correction : ${CORRECTION_STATUS_LABELS[c.correction.status]} — passer à « ${CORRECTION_STATUS_LABELS[NEXT_STATUS[c.correction.status]]} »`}
                style={{ marginTop: 6, fontSize: 11, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 5, padding: '3px 8px', minHeight: 30, background: 'var(--card)', color: 'var(--ink)', cursor: statusBusyId === c.id ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {statusBusyId === c.id ? '…' : `→ ${CORRECTION_STATUS_LABELS[NEXT_STATUS[c.correction.status]]}`}
              </button>
            )}
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
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy || correctionBusy} className="ep-btn-primary" style={{ border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 12px', minHeight: 40, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ＋ Commentaire
            </button>
            {/* CS-5 — sibling of "Commenter": file a scenario Correction from the selected passage. */}
            <button
              type="button"
              onClick={() => void requestCorrection()}
              disabled={busy || correctionBusy || !range || !documentId}
              title={!documentId ? 'Enregistrez d’abord le scénario' : !range ? 'Sélectionnez un passage à corriger' : undefined}
              className="ep-btn-secondary"
              style={{ border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 12px', minHeight: 40, fontSize: 12, fontWeight: 700, cursor: !range || !documentId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !range || !documentId ? 0.55 : 1 }}
            >
              {correctionBusy ? 'Envoi…' : 'Demander une correction'}
            </button>
          </div>
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

// Bug (scenario version off-by-one) — mirrors the server's isBlankHtml: strip tags + &nbsp; + whitespace
// and treat the result as blank ('', '   ', <p></p>, <p><br></p>, <p>&nbsp;</p>, and the empty planche
// chrome). A blank Save is suppressed so it can never materialize an empty v1.
function isBlankHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, '').replace(/\s+/g, '').length === 0;
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
