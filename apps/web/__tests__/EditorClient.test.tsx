import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
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
// CS-22 — encoding a real anchor needs a live Yjs binding (absent under the static editor mock), so the
// encoder is stubbed here; its own round-trip is covered in commentHighlight.test.ts.
const encodeAnchor = vi.hoisted(() => vi.fn(() => ({ relFrom: 'AQID', relTo: 'BAUG' }) as { relFrom: string; relTo: string } | null));
vi.mock('../components/editor/richtext/comment-highlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/editor/richtext/comment-highlight')>();
  return { ...actual, resolveCommentTexts: () => liveTextsHolder.map, encodeCommentAnchor: encodeAnchor };
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
  // The snapshot-confirm modal previews the base as PLAIN TEXT (never HTML into a sink).
  getText: () => 'Rin entre dans le sanctuaire.',
  // A truthy `view` lets the highlight-repaint + CS-15 liveTexts effects run (both guard on editor.view).
  view: {},
  isDestroyed: false,
  commands: { setContent: vi.fn(), setCommentHighlights: vi.fn() },
  chain: () => ({ insertContentAt: () => ({ focus: () => ({ run: () => {} }) }) }),
  isActive: () => false,
  state: {
    doc: { childCount: 1, content: { size: 40 }, descendants: () => {}, textBetween: () => 'sous la pluie' },
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
    hasDessin: false,
    members: [{ accountId: 'me', displayName: 'Moi' }, { accountId: 'yuki', displayName: 'Yuki' }],
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
  it('F16-R3: canWrite:false disables « Enregistrer une nouvelle version » and never compacts', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: false } as never));

    const snapshot = await screen.findByRole('button', { name: 'Enregistrer une nouvelle version' });
    await waitFor(() => expect(snapshot).toBeDisabled());

    // CS-21 — the idle compaction tick must not reach the API either (the route 403s).
    act(() => editorHandlers['update']?.());
    await act(async () => { await new Promise((r) => setTimeout(r, 5200)); });
    expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
  }, 10000);

  it('F16-R3: canWrite:true keeps « Enregistrer une nouvelle version » enabled and calling through', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    act(() => getProvider().handlers.onStatus!('connected'));
    act(() => getProvider().handlers.onSync!({ canWrite: true } as never));

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
  });

  // Feedback round 2 (2026-09-01) — « Enregistrer une nouvelle version » no longer waits for the
  // first autosave: it is available on a blank card and materializes v1 itself.
  it('hides the version chip until materialized but keeps the save-version button available', async () => {
    await renderEditor(makeDoc({ asset: null }));
    expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' })).toBeInTheDocument();
    expect(screen.getByText(/Enregistrez d’abord le scénario/)).toBeInTheDocument();
  });

  it('on a blank card, confirming the version modal materializes v1 via autosave (no snapshot POST)', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      savedAt: 'now',
      materialized: { assetId: 'a-new', filename: 'scenario-page-5.html', documentId: 'doc-new' },
    });
    await renderEditor(makeDoc({ asset: null }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer une nouvelle version' });
    expect(within(dialog).getByText('v1')).toBeInTheDocument(); // first version — no v0 → v1 arrow
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1));
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
    expect(await screen.findByText('Nouvelle version enregistrée')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('v1')).toBeInTheDocument()); // chip materialized
  });

  it('snapshots a new version and confirms', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    expect(screen.getByText('v1')).toBeInTheDocument();
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument());
    expect(screen.getByText('Nouvelle version enregistrée')).toBeInTheDocument();
  });

  // User feedback 2026-09-01 — creating a version is a confirm modal showing the base content
  // (plain text, never HTML into a sink) and the version transition; nothing posts before confirm.
  it('opens the version confirm modal with the base preview; Annuler aborts without a POST', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer une nouvelle version' });
    expect(within(dialog).getByText('v1 → v2')).toBeInTheDocument();
    expect(within(dialog).getByText(/Rin entre dans le sanctuaire/)).toBeInTheDocument();
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: 'Enregistrer une nouvelle version' })).not.toBeInTheDocument();
    expect(api.snapshotEditorVersion).not.toHaveBeenCalled();
  });

  it('carries the optional note typed in the modal into the version POST', async () => {
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.type(await screen.findByLabelText(/NOTE \(optionnelle\)/i), 'Chapitre relu');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
    expect(api.snapshotEditorVersion).toHaveBeenCalledWith('pg1', expect.objectContaining({ note: 'Chapitre relu' }), 'a1');
  });

  // Feedback 2026-09-01 (phantom « Scénario non enregistré ») — a compaction pending at confirm time
  // is flushed BEFORE the version POST, so the edits land and get versioned instead of landing after
  // versionedAt and reading as unsaved.
  it('flushes a pending compaction before the version POST', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    act(() => editorHandlers['update']?.()); // arms the 5s idle timer
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
    expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);
    const autosaveOrder = (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const snapshotOrder = (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(autosaveOrder).toBeLessThan(snapshotOrder);
  });

  it('surfaces a version-snapshot failure with the server message', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockRejectedValue({ message: 'Aucun scénario à versionner' });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
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

  // ── CS-21 — background compaction: no « Enregistrer », no Ctrl+S, no dirty state. The client
  //    compacts on idle (~5s), on visibilitychange→hidden and on unmount; the header carries a passive
  //    status that reports and is never a button. ──

  it('CS-21 F1/A1: the header has no « Enregistrer » button and Ctrl+S saves nothing', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));

    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    // « Enregistrer une nouvelle version » keeps all the ceremony (F4).
    expect(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' })).toBeInTheDocument();

    act(() => editorHandlers['update']?.());
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await act(async () => { await Promise.resolve(); });
    expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
  });

  it('CS-21 F2: the status is a text report, never a button', async () => {
    await renderEditor(makeDoc());
    act(() => getProvider().handlers.onStatus!('connected'));
    const status = await screen.findByText('Enregistré');
    expect(status.tagName).toBe('SPAN');
    expect(status.closest('button')).toBeNull();
    expect(status.getAttribute('role')).toBe('status');
  });

  it('CS-21 F3/A2: typing then going idle ~5 s compacts once, with the unchanged payload', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }),
      );
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      act(() => editorHandlers['update']?.());
      expect(api.autosaveEditorDocument).not.toHaveBeenCalled(); // not before the idle window
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

      expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);
      // Payload unchanged from the explicit-save era: (pageId, body, loaded assetId).
      expect(api.autosaveEditorDocument).toHaveBeenCalledWith(
        'pg1',
        expect.objectContaining({ ydocState: expect.any(String), contentJson: expect.any(Object), html: expect.any(String) }),
        'a1',
      );
      expect(api.snapshotEditorVersion).not.toHaveBeenCalled(); // compaction never versions
    } finally {
      vi.useRealTimers();
    }
  });

  it('CS-21 F3: a keystroke inside the window restarts the debounce (one compaction, not two)', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      act(() => editorHandlers['update']?.());
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      act(() => editorHandlers['update']?.());
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CS-21 F3/A3: visibilitychange → hidden flushes the pending compaction immediately', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      act(() => editorHandlers['update']?.());
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
      expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);

      // The flush consumed the pending tick: the timer must not fire a second request.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('CS-21 F3/A3: unmounting with a pending edit flushes the compaction', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      const view = render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      act(() => editorHandlers['update']?.());
      await act(async () => { view.unmount(); await Promise.resolve(); });
      expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CS-21 F5: the status reports « Enregistrement… » in flight, then « Enregistré »', async () => {
    let release!: (v: unknown) => void;
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { release = r; }));
    await renderEditor(makeDoc());
    act(() => getProvider().handlers.onStatus!('connected'));

    act(() => editorHandlers['update']?.());
    await waitFor(() => expect(screen.getByText('Enregistrement…')).toBeInTheDocument(), { timeout: 6000 });
    await act(async () => { release({ savedAt: 'now', materialized: null }); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('Enregistré')).toBeInTheDocument());
  }, 12000);

  it('CS-21 F5: disconnected wins over everything — the offline copy is shown', async () => {
    await renderEditor(makeDoc());
    act(() => getProvider().handlers.onStatus!('connected'));
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
    act(() => getProvider().handlers.onStatus!('reconnecting'));
    expect(
      screen.getByText('Hors ligne — les modifications reprendront à la reconnexion'),
    ).toBeInTheDocument();
  });

  it('CS-21 F5: one failed compaction is silent; the SECOND consecutive one toasts once', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('500'));
      render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      act(() => editorHandlers['update']?.());
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(
        screen.queryByText('L’enregistrement continu a échoué. Vos modifications restent partagées.'),
      ).not.toBeInTheDocument();

      act(() => editorHandlers['update']?.());
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(
        screen.getAllByText('L’enregistrement continu a échoué. Vos modifications restent partagées.'),
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CS-21 F5: a success between two failures resets the counter (no toast)', async () => {
    vi.useFakeTimers();
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
      const autosave = api.autosaveEditorDocument as ReturnType<typeof vi.fn>;
      autosave
        .mockRejectedValueOnce(new Error('500'))
        .mockResolvedValueOnce({ savedAt: 'now', materialized: null })
        .mockRejectedValueOnce(new Error('500'));
      render(<EditorClient slug="lames" pageId="pg1" />);
      await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());

      for (let i = 0; i < 3; i += 1) {
        act(() => editorHandlers['update']?.());
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      }
      expect(
        screen.queryByText('L’enregistrement continu a échoué. Vos modifications restent partagées.'),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

  it('CS-21: restoring an older version into the draft schedules a compaction (no dirty state)', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 1, mediaId: 'm1', size: 10, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-10', thumbnailUrl: null, active: false },
      { version: 2, mediaId: 'm2', size: 12, note: null, authorId: 'me', authorName: 'Moi', createdAt: '2026-07-11', thumbnailUrl: null, active: true },
    ]);
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({ selected: { fromHtml: '<p>Ancienne version</p>', comments: [] } });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 2 } }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Version affichée' }));
    await userEvent.click(screen.getByRole('option', { name: 'v1' }));
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurer dans le brouillon' }));
    expect(await screen.findByText('Version restaurée dans le brouillon')).toBeInTheDocument();
    // CS-21 — no « Modifications non enregistrées »: the restore compacts itself on the idle tick.
    expect(screen.queryByText('Modifications non enregistrées')).not.toBeInTheDocument();
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1), { timeout: 8000 });
  }, 12000);

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
    anchorRelFrom: null, // CS-22 — a pre-migration row: the client falls back to the absolute pair
    anchorRelTo: null,
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

  // Feedback 2026-09-01 — the review screen is dessin-only, so the editor's link to it renders only
  // when a dessin/page file is linked, and says specifically what it opens.
  it('shows « Corrections dessin » only when a dessin file is linked to the card', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, hasDessin: true }));
    expect(screen.getByRole('link', { name: /Corrections dessin/ })).toHaveAttribute('href', '/projet/lames/revision/pg1');
    expect(screen.queryByText(/Révision · corrections/)).not.toBeInTheDocument();
  });

  it('hides the review link entirely when no dessin file is linked', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, hasDessin: false }));
    expect(screen.queryByRole('link', { name: /Corrections dessin/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Révision · corrections/)).not.toBeInTheDocument();
  });

  // FR14 (feedback round 2, 2026-09-01) — the author sets a correction-comment status through the
  // on-brand status DROPDOWN; persists via PATCH /corrections/:id.
  it('FR14: the author sets a correction-comment status from the editor panel', async () => {
    (api.updateCorrection as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x1', status: 'en_cours' });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'me', text: 'À revoir', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ status: 'a_corriger' }) }),
        ],
      }),
    );
    const select = screen.getByRole('combobox', { name: /Statut de la correction/i });
    expect(select.textContent).toContain('À corriger');
    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: 'En cours' }));
    await waitFor(() => expect(api.updateCorrection).toHaveBeenCalledWith('x1', { status: 'en_cours' }));
    // The chip reflects the server response.
    await waitFor(() => expect(screen.getByText(/Correction · En cours/)).toBeInTheDocument());
  });

  // FR14 — the assignee (not the author) also sees the control (gated on correction.assigneeId).
  it('FR14: the assignee sees the status control even when not the author', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'someone', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ assigneeId: 'me' }) }),
        ],
      }),
    );
    expect(screen.getByRole('combobox', { name: /Statut de la correction/i })).toBeInTheDocument();
  });

  // Feedback round 2 (2026-09-01) — a correction-comment can be (re)assigned after creation.
  it('FR14bis: the author assigns a correction-comment through « Assignée à »; persists via PATCH', async () => {
    (api.updateCorrection as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'x1', status: 'a_corriger', assigneeId: 'yuki' });
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'me', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ status: 'a_corriger', assigneeId: null }) }),
        ],
      }),
    );
    const picker = screen.getByRole('combobox', { name: 'Assignée à' });
    expect(picker.textContent).toContain('Non assignée');
    await userEvent.click(picker);
    await userEvent.click(screen.getByRole('option', { name: 'Yuki' }));
    await waitFor(() => expect(api.updateCorrection).toHaveBeenCalledWith('x1', { assigneeId: 'yuki' }));
  });

  it('FR14: a member who is neither author nor assignee sees no status control', async () => {
    await renderEditor(
      makeDoc({
        asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 },
        comments: [
          mkComment({ id: 'corr', authorId: 'someone', quote: null, anchorFrom: null, anchorTo: null, correction: mkCorrection({ assigneeId: 'other' }) }),
        ],
      }),
    );
    expect(screen.queryByRole('combobox', { name: /Statut de la correction/i })).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('combobox', { name: /Statut de la correction/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Corrigé' }));
    expect(await screen.findByText('Changement de statut refusé.')).toBeInTheDocument();
    expect(screen.getByText(/Correction · À corriger/)).toBeInTheDocument();
  });

  // Fb-6 — an identical snapshot the server no-ops reports "Aucune modification depuis la v{n}".
  it('Fb-6: an unchanged snapshot (same head version) toasts "Aucune modification depuis la v1"', async () => {
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
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

  it('version off-by-one: a blank editor compaction is a silent no-op (no autosave request)', async () => {
    const originalGetHTML = fakeEditor.getHTML;
    // Mirror the server's isBlankHtml: '', whitespace, <p></p>, <p><br></p>, <p>&nbsp;</p> all count blank.
    fakeEditor.getHTML = () => '<div data-case-block><p></p></div>';
    try {
      (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc({ asset: null, documentId: null }));
      (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
      render(<EditorClient slug="lames" pageId="pg1" />);
      await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
      // CS-21 — the idle tick, not a button, is what would fire the request.
      act(() => editorHandlers['update']?.());
      await act(async () => { await new Promise((r) => setTimeout(r, 5200)); });
      expect(api.autosaveEditorDocument).not.toHaveBeenCalled();
    } finally {
      fakeEditor.getHTML = originalGetHTML;
    }
  }, 12000);

  it('version off-by-one: compaction targets the loaded asset id (edits in place, no duplicate)', async () => {
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, documentId: 'doc-1' }));
    act(() => editorHandlers['update']?.());
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1), { timeout: 8000 });
    // The third arg (assetId) must be the loaded asset so resolveEditorAsset edits it in place.
    expect(api.autosaveEditorDocument).toHaveBeenCalledWith('pg1', expect.any(Object), 'a1');
  }, 12000);

  it('version off-by-one: "Enregistrer une nouvelle version" POST carries the loaded asset id', async () => {
    (api.snapshotEditorVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'a1', filename: 'scenario.html', currentVersion: 2 });
    await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.snapshotEditorVersion).toHaveBeenCalledTimes(1));
    expect(api.snapshotEditorVersion).toHaveBeenCalledWith('pg1', expect.any(Object), 'a1');
  });

  // FR7 / QA F1 — after a same-session materialization, "Demander une correction" is no longer blocked
  // on a missing documentId (its disabled reason shifts from "Enregistrez d'abord" to "Sélectionnez…").
  it('FR7: captures the materialized documentId (via the compaction tick) so "Demander une correction" works without reload', async () => {
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc({ asset: null, documentId: null }));
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      savedAt: 'now',
      materialized: { assetId: 'a1', filename: 'scenario.html', documentId: 'doc-1' },
    });
    render(<EditorClient slug="lames" pageId="pg1" />);
    await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    // Blank card: no composer yet.
    expect(screen.queryByRole('button', { name: 'Demander une correction' })).not.toBeInTheDocument();
    // CS-21 — the idle compaction tick materializes the document (no button, no Ctrl+S).
    act(() => editorHandlers['update']?.());
    await waitFor(() => expect(api.autosaveEditorDocument).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const btn = await screen.findByRole('button', { name: 'Demander une correction' });
    // documentId is now set → the disabled reason is the missing selection, not the missing document.
    expect(btn).toHaveAttribute('title', 'Sélectionnez un passage à corriger');
  }, 12000);

  // ── CS-22 — the composer ships the durable relative anchors alongside the absolute pair ──
  describe('CS-22 durable anchors on create', () => {
    const selectRange = () =>
      act(() => {
        Object.assign(fakeEditor.state.selection, { from: 4, to: 12, empty: false });
        editorHandlers['selectionUpdate']?.();
      });

    it('sends anchorRelFrom/anchorRelTo with an anchored comment', async () => {
      await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, documentId: 'doc-1' }));
      selectRange();
      expect(encodeAnchor).toHaveBeenCalledWith(fakeEditor.state, 4, 12);
      await userEvent.type(screen.getByLabelText('Commenter la sélection'), 'À revoir');
      (api.addCaseComment as ReturnType<typeof vi.fn>).mockResolvedValue(mkComment());
      await userEvent.click(screen.getByRole('button', { name: '＋ Commentaire' }));
      expect(api.addCaseComment).toHaveBeenCalledWith(
        'pg1',
        1,
        { text: 'À revoir', anchorFrom: 4, anchorTo: 12, quote: 'sous la pluie', anchorRelFrom: 'AQID', anchorRelTo: 'BAUG' },
        undefined,
      );
    });

    it('omits them when the Yjs binding is not ready (absolute pair only, as before)', async () => {
      encodeAnchor.mockReturnValueOnce(null);
      await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, documentId: 'doc-1' }));
      selectRange();
      await userEvent.type(screen.getByLabelText('Commenter la sélection'), 'À revoir');
      (api.addCaseComment as ReturnType<typeof vi.fn>).mockResolvedValue(mkComment());
      await userEvent.click(screen.getByRole('button', { name: '＋ Commentaire' }));
      expect(api.addCaseComment).toHaveBeenCalledWith('pg1', 1, { text: 'À revoir', anchorFrom: 4, anchorTo: 12, quote: 'sous la pluie' }, undefined);
    });

    it('a scenario correction carries them on its anchor (AC5 — it inherits the durable anchor)', async () => {
      await renderEditor(makeDoc({ asset: { id: 'a1', filename: 'scenario.html', currentVersion: 1 }, documentId: 'doc-1' }));
      selectRange();
      await userEvent.type(screen.getByLabelText('Commenter la sélection'), 'Reformuler');
      (api.createCorrection as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'corr-1' });
      await userEvent.click(screen.getByRole('button', { name: 'Demander une correction' }));
      expect(api.createCorrection).toHaveBeenCalledWith(
        'pg1',
        expect.objectContaining({
          type: 'scenario',
          anchor: { documentId: 'doc-1', from: 4, to: 12, quote: 'sous la pluie', relFrom: 'AQID', relTo: 'BAUG' },
        }),
      );
    });
  });

});
