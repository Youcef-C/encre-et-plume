import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EditorDocumentResponse } from '@encre-et-plume/shared';

// ── Mock the realtime provider: capture handlers + a controllable awareness map. ──
type Handlers = {
  onStatus?: (s: string) => void;
  onSync?: () => void;
  onComment?: (c: unknown) => void;
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

// ── Mock TipTap: a static fake editor + a placeholder EditorContent. ──
const editorHandlers: Record<string, () => void> = {};
const fakeEditor = {
  on: (e: string, fn: () => void) => { editorHandlers[e] = fn; },
  off: () => {},
  setEditable: vi.fn(),
  getJSON: () => ({ type: 'doc', content: [] }),
  getHTML: () => '<div data-case-block></div>',
  commands: { setContent: vi.fn() },
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getEditorDocument: vi.fn(),
    autosaveEditorDocument: vi.fn(),
    snapshotEditorVersion: vi.fn(),
    addCaseComment: vi.fn(),
    sharePage: vi.fn(),
    getProjectWorkspace: vi.fn(),
    listProjectAssets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
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
    contentJson: null,
    initialHtml: null,
    cases: [],
    comments: [],
    ...over,
  };
}

async function renderEditor(doc: EditorDocumentResponse) {
  (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);
  render(<EditorClient slug="lames" pageId="pg1" />);
  await waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
}

describe('EditorClient (Éditeur shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHolder.instances.length = 0;
    for (const k of Object.keys(editorHandlers)) delete editorHandlers[k];
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
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

  it('shows the connecting banner and drops to read-only until connected', async () => {
    await renderEditor(makeDoc());
    expect(screen.getByText('Connexion…')).toBeInTheDocument();
    act(() => getProvider().handlers.onStatus!('connected'));
    await waitFor(() => expect(screen.queryByText('Connexion…')).not.toBeInTheDocument());
    act(() => getProvider().handlers.onStatus!('reconnecting'));
    expect(screen.getByText('Reconnexion en cours — lecture seule')).toBeInTheDocument();
    expect(fakeEditor.setEditable).toHaveBeenCalledWith(false);
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
    // Two "＋ Commentaire" buttons: the toolbar one focuses the field, the sidebar one submits.
    const buttons = screen.getAllByRole('button', { name: '＋ Commentaire' });
    await userEvent.click(buttons[buttons.length - 1]);
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

  it('flips the save indicator to "Enregistré ✓" after autosave', async () => {
    vi.useFakeTimers();
    (api.getEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue(makeDoc());
    (api.autosaveEditorDocument as ReturnType<typeof vi.fn>).mockResolvedValue({ savedAt: 'now', materialized: null });
    render(<EditorClient slug="lames" pageId="pg1" />);
    await vi.waitFor(() => expect(screen.getByText('Lames de Brume')).toBeInTheDocument());
    act(() => editorHandlers['update']?.());
    expect(screen.getByText('Enregistrement…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.getByText('Enregistré ✓')).toBeInTheDocument();
    vi.useRealTimers();
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
});
