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
import { plancheExtensions, blankPlancheDoc, appendCase, casePlaceholder } from '../editor/richtext/planche-schema';
import RichTextToolbar from '../editor/richtext/RichTextToolbar';
import PageSwitcher from './PageSwitcher';
import { PenNibIcon, BrushIcon, FileTextIcon, ChatIcon } from '../icons';

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
  account: { id: string; displayName: string; role: string };
}) {
  const [asset, setAsset] = useState(initial.asset);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [comments, setComments] = useState<CaseCommentDto[]>(initial.comments);
  const [toast, setToast] = useState<string | null>(null);
  const [provider, setProvider] = useState<EditorCollabProvider | null>(null);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const seededRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const myColor = colorForId(account.id);
  const myRole: 'pen' | 'brush' = account.role.includes('dessin') ? 'brush' : 'pen';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
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
      },
      assetId,
    );
    p.setLocalUser('user', { id: account.id, name: account.displayName, color: myColor, role: myRole });
    p.setLocalUser('typing', false);
    setProvider(p);
    return () => {
      p.destroy();
      setProvider(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ydoc, pageId, assetId, account.id]);

  // Live presence from awareness — recreated whenever the provider instance changes.
  useEffect(() => {
    if (!provider) return;
    const updatePeers = () => setPeers(readPeers(provider));
    provider.awareness.on('change', updatePeers);
    updatePeers();
    return () => {
      provider.awareness.off('change', updatePeers);
    };
  }, [provider]);

  // ── The TipTap editor bound to the Y.Doc; recreated when the provider instance changes. ──────
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        ...buildRichTextExtensions({ collab: true, ownDocument: true, placeholder: casePlaceholder }),
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
      editorProps: { attributes: { 'aria-label': 'Éditeur de scénario', role: 'textbox', 'aria-multiline': 'true' } },
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

  // ── Autosave (2s debounce) + typing awareness ────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!editor) return;
    setSaveState('saving');
    try {
      const res = await api.autosaveEditorDocument(
        pageId,
        { ydocState: encodeState(ydoc), contentJson: editor.getJSON() as Record<string, unknown>, html: editor.getHTML() },
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
    showToast('Nouvelle version enregistrée');
  };

  const typingPeer = peers.find((p) => p.typing);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 70px' }}>
      <ConnectionBanner status={status} />
      {/* Item 1 — the card must NOT clip (no overflow:hidden), or the sticky controls get trapped in
          a non-scrolling scrollport. The whole page scrolls with the window; the header + toolbar are
          sticky (see .ep-editor-sticky) so every A4 page stays fully visible while they stay pinned. */}
      <div className="ep-editor-card" style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '6px 6px 0 var(--shadow)' }}>
        <div className="ep-editor-sticky">
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
                onError={showToast}
                onFocusComment={() => commentInputRef.current?.focus()}
                editor={editor}
              />
            }
          />
        </div>
        <div className="ep-editor-body" style={{ display: 'flex' }}>
          <div className="ep-editor-main" style={{ flex: 1, padding: '24px 30px', minWidth: 0, background: 'var(--tone)' }}>
            {/* Item 11 — each case renders as its own bordered A4 sheet (see .ep-a4-sheet / .ep-case-block). */}
            <div className="ep-a4-sheet">
              <div className="ep-planche-canvas" style={{ fontSize: 14, lineHeight: 1.6 }}>
                <EditorContent editor={editor} />
              </div>
              {editor && status === 'connected' && (
                <button
                  type="button"
                  onClick={() => appendCase(editor)}
                  style={{ marginTop: 14, border: '2px dashed var(--ink)', borderRadius: 6, padding: '10px 14px', minHeight: 44, fontSize: 13, fontWeight: 700, color: 'var(--ink2)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ＋ Ajouter une case
                </button>
              )}
            </div>
          </div>
          <Sidebar
            peers={peers}
            self={{ id: account.id, name: account.displayName, color: myColor, role: myRole, typing: false }}
            comments={comments}
            typingPeer={typingPeer ?? null}
            canComment={!!asset}
            editor={editor}
            pageId={pageId}
            assetId={assetId}
            commentInputRef={commentInputRef}
            onCommentAdded={(c) => setComments((list) => mergeComment(list, c))}
          />
        </div>
      </div>
      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, boxShadow: '4px 4px 0 var(--shadow)', zIndex: 60, maxWidth: 'calc(100vw - 32px)', textAlign: 'center' }}>
          {toast}
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
}: {
  slug: string;
  projectTitle: string;
  switcherLabel: string;
  pageId: string;
  saveState: SaveState;
  peers: Peer[];
  selfColor: string;
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
        <AvatarDot color={selfColor} />
        {peers.map((p) => (
          <AvatarDot key={p.id} color={p.color} shift />
        ))}
        <span style={{ fontSize: 12, color: 'var(--ink2)', marginLeft: 9, fontWeight: 700 }}>{onlineCount} en ligne</span>
      </div>
      <SharePopover pageId={pageId} />
    </div>
  );
}

function AvatarDot({ color, shift }: { color: string; shift?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
        border: `3px solid ${color}`,
        display: 'block',
        marginLeft: shift ? -9 : 0,
      }}
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

// ── Toolbar right-hand extras: file dropdown + version snapshot + "＋ Commentaire" ──
function ToolbarExtras({
  slug,
  pageId,
  assetId,
  currentAsset,
  onSnapshot,
  onError,
  onFocusComment,
  editor,
}: {
  slug: string;
  pageId: string;
  assetId?: string;
  currentAsset: EditorDocumentResponse['asset'];
  onSnapshot: (a: AssetItem) => void;
  onError: (msg: string) => void;
  onFocusComment: () => void;
  editor: Editor | null;
}) {
  const [snapping, setSnapping] = useState(false);
  const version = currentAsset?.currentVersion ?? null;

  const snapshot = async () => {
    if (!editor || snapping) return;
    setSnapping(true);
    try {
      const updated = await api.snapshotEditorVersion(pageId, { html: editor.getHTML() }, assetId);
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
      <button
        type="button"
        onClick={onFocusComment}
        disabled={!currentAsset}
        title={currentAsset ? 'Ajouter un commentaire' : 'Enregistrez d’abord le scénario pour commenter.'}
        style={{ background: currentAsset ? 'var(--accent)' : 'var(--tone)', color: currentAsset ? '#fff' : 'var(--ink2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 12px', minHeight: 32, fontSize: 13, fontWeight: 700, cursor: currentAsset ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
      >
        ＋ Commentaire
      </button>
      {version != null && (
        <>
          <span title="Version courante" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '3px 8px' }}>v{version}</span>
          <button
            type="button"
            onClick={snapshot}
            disabled={snapping}
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 12px', minHeight: 32, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {snapping ? 'Enregistrement…' : 'Enregistrer une nouvelle version'}
          </button>
        </>
      )}
    </>
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

// ── Right sidebar: presence + per-case comments + typing indicator ──────────────
function Sidebar({
  peers,
  self,
  comments,
  typingPeer,
  canComment,
  editor,
  pageId,
  assetId,
  commentInputRef,
  onCommentAdded,
}: {
  peers: Peer[];
  self: Peer;
  comments: CaseCommentDto[];
  typingPeer: Peer | null;
  canComment: boolean;
  editor: Editor | null;
  pageId: string;
  assetId?: string;
  commentInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onCommentAdded: (c: CaseCommentDto) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, forceRender] = useState(0);

  // Track the caret so "case N" reflects the block the comment will anchor to.
  useEffect(() => {
    if (!editor) return;
    const rerender = () => forceRender((n) => n + 1);
    editor.on('selectionUpdate', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
    };
  }, [editor]);

  const currentCaseNo = caseNoAtSelection(editor);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Le commentaire ne peut pas être vide');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.addCaseComment(pageId, currentCaseNo, { text: trimmed }, assetId);
      onCommentAdded(created);
      setText('');
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Impossible d’ajouter le commentaire');
    } finally {
      setBusy(false);
    }
  };

  const online = [self, ...peers];

  return (
    <aside className="ep-editor-sidebar" aria-label="Présence et commentaires" style={{ width: 256, borderLeft: '3px solid var(--ink)', padding: '14px 15px', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 9 }}>En ligne</div>
      <ul style={{ listStyle: 'none', margin: '0 0 15px', padding: 0, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 500 }}>
        {online.map((p) => (
          <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'block' }} />
            {p.name}
            {p.role === 'brush' ? <BrushIcon size={13} /> : <PenNibIcon size={13} />}
          </li>
        ))}
      </ul>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Commentaires</div>
      {/* Item 3 — the composer follows directly under the last comment (no flex:1 pushing it to the
          bottom); the sidebar itself scrolls (.ep-editor-sidebar overflow-y:auto). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>Aucun commentaire</div>}
        {comments.map((c) => (
          <div key={c.id} style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 10px', fontSize: 12, background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px', border: '1.5px solid var(--ink)', display: 'block' }} />
              <b>{c.authorName}</b>
              <span style={{ color: 'var(--ink2)' }}>case {c.caseNo}</span>
            </div>
            <div style={{ color: 'var(--ink)', lineHeight: 1.3 }}>{c.text}</div>
          </div>
        ))}
      </div>

      {canComment ? (
        <form onSubmit={submit} style={{ marginTop: 10 }}>
          <label htmlFor="ep-comment-input" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChatIcon size={12} /> Commentaire — case {currentCaseNo}</span>
          </label>
          <textarea
            id="ep-comment-input"
            ref={commentInputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            aria-label={`Ajouter un commentaire à la case ${currentCaseNo}`}
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
        <p style={{ marginTop: 10, fontSize: 11, color: 'var(--ink2)', fontStyle: 'italic' }}>Enregistrez d’abord le scénario pour commenter.</p>
      )}

      {typingPeer && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: typingPeer.color, fontWeight: 700 }} aria-live="polite">
          <span style={{ display: 'flex', gap: 3 }} aria-hidden="true">
            {[0, 0.2, 0.4].map((d) => (
              <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: typingPeer.color, display: 'block', animation: `epType 1.2s infinite ${d}s` }} />
            ))}
          </span>
          {typingPeer.name} écrit…
        </div>
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
  cursor.classList.add('collaboration-cursor__caret');
  cursor.setAttribute('style', `border-color: ${color}`);
  cursor.setAttribute('role', 'img');
  cursor.setAttribute('aria-label', `Curseur de ${name}`);
  const label = document.createElement('div');
  label.classList.add('collaboration-cursor__label');
  label.setAttribute('style', `background-color: ${color}`);
  label.insertBefore(document.createTextNode(name), null);
  cursor.insertBefore(label, null);
  return cursor;
}

function encodeState(ydoc: Y.Doc): string {
  const u = Y.encodeStateAsUpdate(ydoc);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

// B-2 — self-exclusion keys off the Yjs awareness clientID (stable), NOT user.id which
// @tiptap/extension-collaboration-caret clobbers to { name, color } on mount.
function readPeers(provider: EditorCollabProvider): Peer[] {
  const out: Peer[] = [];
  const selfClientId = provider.awareness.clientID;
  provider.awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfClientId) return;
    const s = state as Partial<EditorAwarenessState>;
    if (!s.user) return;
    out.push({
      id: s.user.id ?? String(clientId),
      name: s.user.name ?? 'Collaborateur',
      color: s.user.color ?? '#888',
      role: s.user.role ?? 'pen',
      typing: !!s.typing,
    });
  });
  return out;
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
