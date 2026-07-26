import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EditorDocumentResponse, CaseCommentDto } from '@encre-et-plume/shared';

// ── Mock the realtime provider: capture handlers + a controllable awareness map. ──
type Handlers = {
  onStatus?: (s: string) => void;
  onSync?: (payload?: unknown) => void;
  onComment?: (c: unknown) => void;
  onCommentDeleted?: (id: string) => void;
  onMaterialized?: (id: string) => void;
};
interface MockProvider {
  awareness: { clientID: number; states: Map<number, unknown>; getStates(): Map<number, unknown>; on(e: string, fn: () => void): void; off(): void; emit(): void; setPeer(id: number, s: unknown): void };
  handlers: Handlers;
  destroyed: boolean;
}
const providerHolder = vi.hoisted(() => ({ current: null as unknown as MockProvider, instances: [] as MockProvider[] }));
vi.mock('../lib/editor-collab', () => {
  class MockAwareness {
    clientID = 1;
    states = new Map<number, unknown>();
    private listeners: Array<() => void> = [];
    getStates() { return this.states; }
    on(_e: string, fn: () => void) { this.listeners.push(fn); }
    off() {}
    emit() { this.listeners.forEach((f) => f()); }
    setPeer(id: number, state: unknown) { this.states.set(id, state); this.emit(); }
  }
  class EditorCollabProvider {
    awareness = new MockAwareness();
    handlers: Handlers;
    destroyed = false;
    setLocalUser() {}
    destroy() { this.destroyed = true; }
    socket = { emit() {}, on() {} };
    constructor(_doc: unknown, _pageId: string, handlers: Handlers) {
      this.handlers = handlers;
      providerHolder.current = this as unknown as MockProvider;
      providerHolder.instances.push(this as unknown as MockProvider);
    }
  }
  return { EditorCollabProvider };
});
const getProvider = () => providerHolder.current;

// CS-15 — liveTexts feed for the sidebar "· modifié" indicator. resolveCommentTexts reads the live
// editor/Yjs state (unavailable under the static mock), so we mock it and control the id→text map here.
const liveTextsHolder = vi.hoisted(() => ({ map: new Map<string, string>() }));
vi.mock('../components/editor/richtext/comment-highlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/editor/richtext/comment-highlight')>();
  return { ...actual, resolveCommentTexts: () => liveTextsHolder.map };
});

// ── Mock TipTap: a static fake editor + a placeholder EditorContent. ──
// `on` keeps ALL listeners per event (multiple effects subscribe to 'update'); editorHandlers[e] fires them all.
const editorListeners: Record<string, Array<() => void>> = {};
const editorHandlers: Record<string, () => void> = {};
const fakeEditor = {
  on: (e: string, fn: () => void) => {
    (editorListeners[e] ??= []).push(fn);
    editorHandlers[e] = () => editorListeners[e].forEach((f) => f());
  },
  off: () => {},
  setEditable: vi.fn(),
  getJSON: () => ({ type: 'doc', content: [] }),
  // Non-blank by default so the save/materialize tests exercise a real persist. The blank-gate test
  // overrides this to an empty document to assert the no-op (version off-by-one fix).
  getHTML: () => '<div data-case-block><p>Rin entre dans le sanctuaire.</p></div>',
  // A truthy `view` lets the highlight-repaint + CS-15 liveTexts effects run (both guard on editor.view).
  view: {},
  isDestroyed: false,
  commands: { setContent: vi.fn(), setCommentHighlights: vi.fn() },
  chain: () => ({ insertContentAt: () => ({ focus: () => ({ run: () => {} }) }) }),
  isActive: () => false,
  state: {
    doc: { childCount: 1, content: { size: 4 }, descendants: () => {} },
    selection: { from: 1, $from: { depth: 2, node: (d: number) => (d === 1 ? { type: { name: 'caseBlock' }, attrs: { no: 1 } } : { type: { name: 'caseDescription' } }) } },
  },
};
vi.mock('@tiptap/react', () => ({
  useEditor: () => fakeEditor,
  EditorContent: () => null,
  Node: { create: () => ({}) },
}));

vi.mock('../lib/session', () => ({
  useSession: () => ({ account: { id: 'me', displayName: 'Moi', role: 'utilisateur' }, loading: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getEditorDocument: vi.fn(),
    autosaveEditorDocument: vi.fn(),
    snapshotEditorVersion: vi.fn(),
    addCaseComment: vi.fn(),
    deleteCaseComment: vi.fn(),
    sharePage: vi.fn(),
    getProjectWorkspace: vi.fn(),
    listProjectAssets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getAssetVersions: vi.fn().mockResolvedValue([]),
    getReview: vi.fn(),
    createCorrection: vi.fn(),
    updateCorrection: vi.fn(),
  };
});

import * as api from '../lib/api';
import EditorClient from '../components/editeur/EditorClient';

function makeDoc(over: Partial<EditorDocumentResponse> = {}): EditorDocumentResponse {
  return {
    pageId: 'pg1',
    pageTitle: 'Page 5',
    plancheNo: 5,
    total: 40,
    project: { slug: 'lames', title: 'Lames de Brume' },
    chapter: { id: 'c2', number: 2, title: 'La rencontre' },
    asset: null,
    documentId: null,
    ydocState: null,
    contentJson: null,
    initialHtml: null,
    cases: [],
    comments: [],
    template: null,
    ...over,
  };
}

async function renderEditor(doc: EditorDocumentResponse) {
  (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);
  render(<EditorClient slug="lames" pageId="pg1" />);
  await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
  // The title commits before the provider's passive effect necessarily flushes, so wait for the
  // provider itself: every test below drives `getProvider()`, which must be THIS render's instance.
  await waitFor(() => expect(providerHolder.current).toBeTruthy());
}

describe('EditorClient (Éditeur shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset BOTH the holder's `current` and its instance list. Resetting only `instances` let
    // `getProvider()` hand back the PREVIOUS test's provider when this test's provider hadn't been
    // constructed yet (its passive effect not flushed) — the handler then targeted an unmounted tree
    // and `stays writable when the sync payload grants canWrite` failed on a stale value under
    // full-suite load. Null here + the `renderEditor` wait below makes the race fail loudly instead.
    providerHolder.current = null as unknown as MockProvider;
    providerHolder.instances.length = 0;
    liveTextsHolder.map = new Map();
    for (const k of Object.keys(editorHandlers)) delete editorHandlers[k];
    for (const k of Object.keys(editorListeners)) delete editorListeners[k];
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('renders the header replica: back link, title, "Ch. X — Page Y" switcher, Partager', async () => {
    await renderEditor(makeDoc());
    expect(screen.getByRole('link', { name: '‹ Projet' })).toHaveAttribute('href', '/projet/lames');
    // Item 12 — the switcher shows the chapter number AND the page title.
    expect(screen.getByRole('button', { name: /Ch\. 2 — Page 5/ })).toBeInTheDocument();
    // Item 15 — the "Planche N / total" counter is gone.
    expect(screen.queryByText('Planche 5 / 40')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument();
  });

  // Round-3 isolation regression: `beforeEach` must clear the holder's `current`, not just
  // `instances`. When it didn't, `getProvider()` could hand a later test the PREVIOUS test's
  // provider (whenever this test's provider effect hadn't flushed yet), so handlers fired at an
  // unmounted tree and assertions read stale values. This runs after a test that built a provider.
  it('does not leak the previous test’s collab provider into the next test', () => {
    expect(providerHolder.current).toBeNull();
  });

  it('shows the connecting banner and drops to read-only until connected', async () => {
    await renderEditor(makeDoc());
    expect(screen.getByText('Connexion…')).toBeInTheDocument();
    act(() => getProvider().handlers.onStatus!('connected'));
    await waitFor(() => expect(screen.queryByText('Connexion…')).not.toBeInTheDocument());
    act(() => getProvider().handlers.onStatus!('reconnecting'));
    expect(screen.getByText('Reconnexion en cours — lecture seule')).toBeInTheDocument();
    expect(fakeEditor.setEditable).toHaveBeenCalledWith(false);
  });

  // CS-10 — the group « Écriture » permission arrives on the sync payload; without it the editor
  // stays read-only (the server drops that socket's updates anyway).
  it('shows the CS-10 read-only banner when the sync payload says canWrite:false', async () => {
    await renderEditor(makeDoc());
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: false } as never));
    expect(
      await screen.findByText("Lecture seule — vous n'avez pas la permission d'écriture."),
    ).toBeInTheDocument();
    expect(fakeEditor.setEditable).toHaveBeenCalledWith(false);
  });

  it('stays writable when the sync payload grants canWrite', async () => {
    await renderEditor(makeDoc());
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: true } as never));
    await waitFor(() =>
      expect(screen.queryByText("Lecture seule — vous n'avez pas la permission d'écriture.")).not.toBeInTheDocument(),
    );
    expect(fakeEditor.setEditable).toHaveBeenLastCalledWith(true);
  });

  // CS-10 round 3 (F16-R3) — the server now 403s the write routes for a member without « Écriture »
  // (B11-R3). The UI must not dead-end against that: the two write affordances go disabled and their
  // handlers no-op. Client-side only — the gate itself is server-side.
  it('F16-R3: canWrite:false disables Enregistrer + Enregistrer une nouvelle version and calls neither api', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: false } as never));

    const save = await screen.findByRole('button', { name: 'Enregistrer' });
    const snapshot = screen.getByRole('button', { name: 'Enregistrer une nouvelle version' });
    await waitFor(() => expect(save).toBeDisabled());
    expect(snapshot).toBeDisabled();

    // Even bypassing the disabled attribute (keyboard shortcut) must not reach the API.
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await act(async () => { await Promise.resolve(); });
    expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
  });

  it('F16-R3: canWrite:true keeps both write affordances enabled and calling through', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: true } as never));

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
  });

  it('hides the version chip until materialized; blank card cannot comment yet', async () => {
    await renderEditor(makeDoc({ asset: null }));
    expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer une nouvelle version' })).not.toBeInTheDocument();
    expect(screen.getByText(/Enregistrez d’abord le scénario/)).toBeInTheDocument();
  });

  it('snapshots a new version and confirms', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    expect(screen.getByText('v1')).toBeInTheDocument();
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument());
    expect(screen.getByText('Nouvelle version enregistrée')).toBeInTheDocument();
  });

  it('surfaces a version-snapshot failure with the server message', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockRejectedValue({ message: 'Aucun scénario à versionner' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    expect(await screen.findByText('Aucun scénario à versionner')).toBeInTheDocument();
  });

  it('rejects an empty comment', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    // Commenting lives ONLY in the sidebar composer (the toolbar "＋ Commentaire" was removed in b8e1e9e).
    await userEvent.click(screen.getByRole('button', { name: '＋ Commentaire' }));
    expect(await screen.findByText('Le commentaire ne peut pas être vide')).toBeInTheDocument();
    expect(api.addCaseComment).not.toHaveBeenCalled();
  });

  it('B-2: one connected client shows exactly "1 en ligne" even with a clobbered self user', async () => {
    await renderEditor(makeDoc());
    // The caret extension clobbers the local awareness user to { name, color } (no id), keyed on the
    // self clientID (1). readPeers must exclude it by clientID → peers empty → "1 en ligne".
    act(() => getProvider().awareness.setPeer(1, { user: { name: 'Moi', color: '#2a6fdb' }, typing: false }));
    await waitFor(() => expect(screen.getByText('1 en ligne')).toBeInTheDocument());
  });

  it('renders presence and the typing indicator from awareness', async () => {
    await renderEditor(makeDoc());
    act(() =>
      getProvider().awareness.setPeer(2, {
        user: { id: 'yuki', name: 'Yuki', color: '#1f8a5b', role: 'brush' },
        typing: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('2 en ligne')).toBeInTheDocument());
    expect(screen.getByText('Yuki écrit…')).toBeInTheDocument();
  });

  it('drops a stale ghost of the local account (reload) so presence stays "1 en ligne"', async () => {
    await renderEditor(makeDoc());
    // A previous connection of THIS account (session id 'me') lingers under a different clientID after a
    // reload. It must not count as a peer or add a duplicate avatar.
    act(() => getProvider().awareness.setPeer(7, { user: { id: 'me', name: 'Moi', color: '#2a6fdb' }, typing: false }));
    await waitFor(() => expect(screen.getByText('1 en ligne')).toBeInTheDocument());
  });

  it('dedupes multiple connections of the same peer account to one avatar', async () => {
    await renderEditor(makeDoc());
    act(() => {
      getProvider().awareness.setPeer(3, { user: { id: 'yuki', name: 'Yuki', color: '#1f8a5b', role: 'brush' }, typing: false });
      getProvider().awareness.setPeer(4, { user: { id: 'yuki', name: 'Yuki', color: '#1f8a5b', role: 'brush' }, typing: false });
    });
    await waitFor(() => expect(screen.getByText('2 en ligne')).toBeInTheDocument());
  });

  // ── FR9 (r3) — explicit save model: NO autosave; typing marks dirty; Save button + Ctrl/Cmd-S persist. ──

  it('FR9: typing does NOT autosave — it marks the draft dirty and no timer ever persists', async () => {
    vi.useFakeTimers();
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    render(<EditorClient slug="lames" pageId="pg1" />);
    await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    act(() => editorHandlers['update']?.());
    // The dirty indicator shows immediately; NO "Enregistrement…" auto-kicks in.
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('FR9: Ctrl+S persists the current content (no new version) and flips to "Enregistré"', async () => {
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    render(<EditorClient slug="lames" pageId="pg1" />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    act(() => editorHandlers['update']?.());
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1));
    // Save persists content, it does NOT create a version.
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Enregistré')).toBeInTheDocument());
  });

  it('FR9: the toolbar « Enregistrer » button persists the current content', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1));
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
  });

  // Item 2 (iter 5) — Save relocated next to the chapter switcher as an icon-only button. It carries an
  // aria-label so it stays operable/named, and it goes accent when there are unsaved edits (dirty).
  it('Item2: the icon-only Save button sits by the switcher and turns accent when dirty', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    // Icon-only: no visible "Enregistrer" text label, but a title tooltip is present.
    expect(save).toHaveAttribute('title', expect.stringContaining('Enregistrer'));
    // Not dirty yet → card background (not accent).
    expect(save.style.background).not.toContain('accent');
    act(() => editorHandlers['update']?.());
    await waitFor(() => expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Enregistrer' }).style.background).toContain('accent');
  });

  // Item 1 (iter 5) — compare two scenario versions side by side in a modal (A4 sheets), sourced from
  // api.getReview → fromHtml/toHtml (server-sanitized).
  it('Item1: "Comparer" opens the side-by-side compare modal fed by getReview', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 1, mediaId: 'm1', size: 10, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-10', thumbnailUrl: null, active: false },
      { version: 2, mediaId: 'm2', size: 12, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-11', thumbnailUrl: null, active: true },
    ]);
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      selected: { fromHtml: '<p>Contenu v1</p>', toHtml: '<p>Contenu v2</p>' },
    });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 } }));
    await userEvent.click(await screen.findByRole('button', { name: /Comparer/ }));
    expect(await screen.findByRole('dialog', { name: /Comparer les versions/i })).toBeInTheDocument();
    // C8 (iter 6) — "Contenu v1" vs "Contenu v2" is a changed line: the differing word is wrapped
    // as <del>/<ins>, so query those rather than the (now split) full line text.
    await waitFor(() => expect(document.querySelector('del')?.textContent).toBe('v1'));
    expect(document.querySelector('ins')?.textContent).toBe('v2');
    expect(api.getReview).toHaveBeenCalledWith('pg1', { file: 'a1', from: 1, to: 2 });
  });

  it('FR9: restoring an older version into the draft marks it dirty (unsaved)', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 1, mediaId: 'm1', size: 10, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-10', thumbnailUrl: null, active: false },
      { version: 2, mediaId: 'm2', size: 12, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-11', thumbnailUrl: null, active: true },
    ]);
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({ selected: { fromHtml: '<p>Ancienne version</p>', comments: [] } });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 } }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Version affichée' }));
    await userEvent.click(screen.getByRole('option', { name: 'v1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurer dans le brouillon' }));
    expect(await screen.findByText('Modifications non enregistrées')).toBeInTheDocument();
  });

  it('F-I1: StrictMode double-mount leaves a live provider (fresh one not destroyed)', async () => {
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
    render(
      <React.StrictMode>
        <EditorClient slug="lames" pageId="pg1" />
      </React.StrictMode>,
    );
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    await waitFor(() => expect(providerHolder.instances.length).toBeGreaterThanOrEqual(2));
    const live = providerHolder.instances[providerHolder.instances.length - 1];
    expect(live.destroyed).toBe(false); // the finally-active provider survives
    expect(providerHolder.instances.some((p) => p.destroyed)).toBe(true); // an earlier one was torn down
  });

  // ── Prose-only editor (batch 2026-07-14): the Manga/Prose toggle, template picker and "Ajouter une
  //    case" affordance are removed; the editor is always a single prose document. ──

  it('is prose-only: no template selector and no "Ajouter une case" button', async () => {
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
    const { container } = render(<EditorClient slug="lames" pageId="pg1" />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    act(() => getProvider().handlers.onStatus!('connected'));

    // The manga UX is gone entirely.
    expect(screen.queryByRole('group', { name: 'Modèle du document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manga' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une case/ })).not.toBeInTheDocument();

    // The canvas is unconditionally prose (no toggled ep-mode-prose class).
    const canvas = container.querySelector('.ep-planche-canvas')!;
    expect(canvas).toBeInTheDocument();
    expect(canvas.className).not.toContain('ep-mode-prose');
  });

  it('keeps the comments-only sidebar + composer (regression item 16/28)', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));

    // The "En ligne" presence roster is intentionally gone; the Commentaires section must remain.
    expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
    expect(screen.getByText('Commentaires')).toBeInTheDocument();

    // The sticky composer (textarea + submit) is present and usable even though prose has no visible cases.
    expect(screen.getByPlaceholderText('Votre commentaire…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ Commentaire' })).toBeInTheDocument();
  });

  // ── CS-15 — "· modifié" indicator, author-only delete, live removal ──
  const mkComment = (over: Partial<CaseCommentDto> = {}): CaseCommentDto => ({
    id: 'cx',
    caseNo: 1,
    authorId: 'me',
    authorName: 'Moi',
    text: 'Une note',
    createdAt: '2026-07-14T10:00:00.000Z',
    anchorFrom: 4,
    anchorTo: 12,
    quote: 'bonjour le monde',
    version: null,
    correction: null,
    ...over,
  });

  it('CS-15: shows "· modifié" + the current text only when the anchored text differs from the quote', async () => {
    liveTextsHolder.map = new Map([
      ['changed', 'bonsoir la lune'], // differs from its quote → modifié
      ['same', 'bonjour le monde'], // identical → no marker
      ['deleted', ''], // range fully removed → marker but no "maintenant" line
    ]);
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'changed', quote: 'bonjour la lune' }),
          mkComment({ id: 'same', quote: 'bonjour le monde' }),
          mkComment({ id: 'deleted', quote: 'un passage' }),
          mkComment({ id: 'caselevel', anchorFrom: null, anchorTo: null, quote: null }),
        ],
      }),
    );

    // Two "· modifié" markers (changed + deleted), and only the changed one prints a "maintenant :" line.
    // The indicator derives from resolveCommentTexts via an async state update after the editor mounts,
    // so await it (a bare getAllByText races the render under full-suite load).
    await waitFor(() => expect(screen.getAllByText('· modifié')).toHaveLength(2));
    expect(screen.getByText(/maintenant :/)).toHaveTextContent('maintenant : « bonsoir la lune »');
    // The unchanged comment keeps its quote and no marker; case-level comment shows neither quote nor marker.
    expect(screen.getByText('« bonjour le monde »')).toBeInTheDocument();
  });

  it('CS-15: an author sees a labelled trash button on their own comment; a non-author sees none', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'mine', authorId: 'me', authorName: 'Moi' }),
          mkComment({ id: 'theirs', authorId: 'yuki', authorName: 'Yuki' }),
        ],
      }),
    );
    const trashButtons = screen.getAllByRole('button', { name: 'Supprimer le commentaire' });
    expect(trashButtons).toHaveLength(1); // only for the authored comment
  });

  it('CS-15: confirming the delete removes the comment optimistically and calls the API', async () => {
    (api.deleteCaseComment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'mine' });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [mkComment({ id: 'mine', text: 'À supprimer', quote: null, anchorFrom: null, anchorTo: null })],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le commentaire' }));
    expect(await screen.findByText('Supprimer ce commentaire ?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteCaseComment).toHaveBeenCalledWith('pg1', 'mine', undefined));
    expect(screen.queryByText('À supprimer')).not.toBeInTheDocument();
  });

  it('CS-15: a failed delete restores the comment and shows a toast', async () => {
    (api.deleteCaseComment as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 500, message: 'boom' });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [mkComment({ id: 'mine', text: 'À supprimer', quote: null, anchorFrom: null, anchorTo: null })],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le commentaire' }));
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Impossible de supprimer le commentaire')).toBeInTheDocument();
    expect(screen.getByText('À supprimer')).toBeInTheDocument(); // restored
  });

  it('CS-15: a peer deletion removes the comment from the sidebar live (WS onCommentDeleted)', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [mkComment({ id: 'gone', text: 'Note distante', quote: null, anchorFrom: null, anchorTo: null })],
      }),
    );
    expect(screen.getByText('Note distante')).toBeInTheDocument();
    act(() => getProvider().handlers.onCommentDeleted!('gone'));
    await waitFor(() => expect(screen.queryByText('Note distante')).not.toBeInTheDocument());
  });

  // ── CS-5 iter 2 ──

  const mkCorrection = (over: Partial<NonNullable<CaseCommentDto['correction']>> = {}) => ({
    id: 'x1',
    status: 'a_corriger' as const,
    assigneeId: null,
    ...over,
  });

  // Fb-2 — a tagged correction comment shows a «Correction» chip + status; a plain comment doesn't.
  it('Fb-2: renders a «Correction» tag + status on a correction comment, none on a plain comment', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', text: 'Trop chargé', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection() }),
          mkComment({ id: 'plain', text: 'Juste un mot', quote: null, anchorFrom: null, anchorTo: null }),
        ],
      }),
    );
    expect(screen.getByText(/Correction · À corriger/)).toBeInTheDocument();
    // Only the tagged one carries the chip.
    expect(screen.getAllByText(/Correction ·/)).toHaveLength(1);
  });

  // FR15 (r4) — REVERT: no per-version filter combobox; comments render as ONE plain list regardless of
  // their `version`, and all paint highlights.
  it('FR15: mixed-version comments ALL render in one plain list (no version filter combobox)', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 },
        comments: [
          mkComment({ id: 'legacy', text: 'Legacy plain', quote: null, anchorFrom: null, anchorTo: null, version: null }),
          mkComment({ id: 'v1c', text: 'Note v1', quote: null, anchorFrom: null, anchorTo: null, version: 1 }),
          mkComment({ id: 'v2c', text: 'Note v2', quote: null, anchorFrom: null, anchorTo: null, version: 2 }),
        ],
      }),
    );
    expect(screen.getByText('Legacy plain')).toBeInTheDocument();
    expect(screen.getByText('Note v1')).toBeInTheDocument();
    expect(screen.getByText('Note v2')).toBeInTheDocument();
    // The version-filter combobox is gone (reverted) — no comment-list filter anywhere.
    expect(screen.queryByRole('combobox', { name: /Filtrer les commentaires par version/ })).not.toBeInTheDocument();
  });

  // FR15 — the version switcher + its read-only view still work (untouched security path).
  it('FR15: the version switcher still shows an older version read-only (VersionSheet, no filter)', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 1, mediaId: 'm1', size: 10, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-10', thumbnailUrl: null, active: false },
      { version: 2, mediaId: 'm2', size: 12, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-11', thumbnailUrl: null, active: true },
    ]);
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({ selected: { fromHtml: '<p>Ancienne version</p>' } });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 } }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Version affichée' }));
    await userEvent.click(screen.getByRole('option', { name: 'v1' }));
    expect(await screen.findByText('Lecture seule — v1')).toBeInTheDocument();
    expect(screen.getByText('Ancienne version')).toBeInTheDocument();
  });

  // FR14 (r4) — the in-canvas highlight for a correction comment carries the `correction` flag so it can
  // be tagged distinctly (ep-correction-highlight); a plain comment does not.
  it('FR14: correction comments paint with correction:true, plain comments with correction:false', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', quote: 'x', anchorFrom: 1, anchorTo: 3, correction: mkCorrection() }),
          mkComment({ id: 'plain', quote: 'y', anchorFrom: 1, anchorTo: 3 }),
        ],
      }),
    );
    await waitFor(() => {
      const calls = (fakeEditor.commands.setCommentHighlights as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1][0] as { id: string; correction: boolean }[];
      expect(last.find((r) => r.id === 'corr')?.correction).toBe(true);
      expect(last.find((r) => r.id === 'plain')?.correction).toBe(false);
    });
  });

  // FR14 — the author sees a status stepper on a correction comment; steps via PATCH /corrections/:id.
  it('FR14: the author steps a correction-comment status from the editor panel', async () => {
    (api.updateCorrection as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x1', status: 'en_cours' });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'me', text: 'À revoir', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ status: 'a_corriger' }) }),
        ],
      }),
    );
    const stepper = screen.getByRole('button', { name: /Statut de la correction/i });
    await userEvent.click(stepper);
    await waitFor(() => expect(api.updateCorrection).toHaveBeenCalledWith('x1', { status: 'en_cours' }));
    // The chip reflects the server response.
    await waitFor(() => expect(screen.getByText(/Correction · En cours/)).toBeInTheDocument());
  });

  // FR14 — the assignee (not the author) also sees the stepper (gated on correction.assigneeId).
  it('FR14: the assignee sees the stepper even when not the author', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'someone', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ assigneeId: 'me' }) }),
        ],
      }),
    );
    expect(screen.getByRole('button', { name: /Statut de la correction/i })).toBeInTheDocument();
  });

  it('FR14: a member who is neither author nor assignee sees no status stepper', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'someone', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ assigneeId: 'other' }) }),
        ],
      }),
    );
    expect(screen.queryByRole('button', { name: /Statut de la correction/i })).not.toBeInTheDocument();
  });

  // FR14 — a failed status change toasts and leaves the chip unchanged (no optimistic flip).
  it('FR14: a rejected status change toasts and keeps the chip status', async () => {
    (api.updateCorrection as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 403 });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'me', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ status: 'a_corriger' }) }),
        ],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Statut de la correction/i }));
    expect(await screen.findByText('Changement de statut refusé.')).toBeInTheDocument();
    expect(screen.getByText(/Correction · À corriger/)).toBeInTheDocument();
  });

  // Fb-6 — an identical snapshot the server no-ops reports "Aucune modification depuis la v{n}".
  it('Fb-6: an unchanged snapshot (same head version) toasts "Aucune modification depuis la v1"', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    expect(await screen.findByText('Aucune modification depuis la v1')).toBeInTheDocument();
  });

  // Fb-5 — the version switcher shows an older version read-only, with a way back + restore.
  it('Fb-5: viewing an older version renders it read-only with «Lecture seule — v1»', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 1, mediaId: 'm1', size: 10, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-10', thumbnailUrl: null, active: false },
      { version: 2, mediaId: 'm2', size: 12, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-11', thumbnailUrl: null, active: true },
    ]);
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({ selected: { fromHtml: '<p>Ancienne version</p>' } });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 } }));
    await waitFor(() => expect(api.getAssetVersions).toHaveBeenCalledWith('a1'));
    await userEvent.click(screen.getByRole('combobox', { name: 'Version affichée' }));
    await userEvent.click(screen.getByRole('option', { name: 'v1' }));
    expect(await screen.findByText('Lecture seule — v1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenir à la version actuelle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer dans le brouillon' })).toBeInTheDocument();
    expect(api.getReview).toHaveBeenCalledWith('pg1', { file: 'a1', from: 1, to: 1 });
  });

  // ── Bug (scenario version off-by-one, FE half): never fire a Save with blank html, and target the
  //    opened/loaded asset in place so an import isn't materialized as a duplicate / empty v1. ──

  it('version off-by-one: a blank editor Save is a silent no-op (no autosave request)', async () => {
    const originalGetHTML = fakeEditor.getHTML;
    // Mirror the server's isBlankHtml: '', whitespace, <p></p>, <p><br></p>, <p>&nbsp;</p> all count blank.
    fakeEditor.getHTML = () => '<div data-case-block><p></p></div>';
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc({ asset: null, documentId: null }));
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      render(<EditorClient slug="lames" pageId="pg1" />);
      await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
      act(() => editorHandlers['update']?.());
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      // Give any pending microtasks a beat, then assert the endpoint was never hit.
      await act(async () => { await Promise.resolve(); });
      expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
    } finally {
      fakeEditor.getHTML = originalGetHTML;
    }
  });

  it('version off-by-one: Save targets the loaded asset id (edits in place, no duplicate)', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, documentId: 'doc-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1));
    // The third arg (assetId) must be the loaded asset so resolveEditorAsset edits it in place.
    expect(api.autosaveEditorDocument).toHaveBeenCalledWith('pg1', expect.any(Object), 'a1');
  });

  it('version off-by-one: "Enregistrer une nouvelle version" POST carries the loaded asset id', async () => {
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
    expect(api.snapshotEditorVersion).toHaveBeenCalledWith('pg1', expect.any(Object), 'a1');
  });

  // FR7 / QA F1 — after a same-session materialization, "Demander une correction" is no longer blocked
  // on a missing documentId (its disabled reason shifts from "Enregistrez d'abord" to "Sélectionnez…").
  it('FR7: captures the materialized documentId (via explicit save) so "Demander une correction" works without reload', async () => {
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc({ asset: null, documentId: null }));
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      savedAt: 'now',
      materialized: { assetId: 'a1', filename: 'scenario.html', documentId: 'doc-1' },
    });
    render(<EditorClient slug="lames" pageId="pg1" />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    // Blank card: no composer yet.
    expect(screen.queryByRole('button', { name: 'Demander une correction' })).not.toBeInTheDocument();
    // FR9 — an explicit save materializes the document (no autosave tick).
    act(() => editorHandlers['update']?.());
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1));
    const btn = await screen.findByRole('button', { name: 'Demander une correction' });
    // documentId is now set → the disabled reason is the missing selection, not the missing document.
    expect(btn).toHaveAttribute('title', 'Sélectionnez un passage à corriger');
  });
});
