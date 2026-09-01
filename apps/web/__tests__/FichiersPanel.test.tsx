import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AssetItem,
  AssetListResponse,
  MediaResponse,
  WorkspaceChapter,
  WorkspacePage,
} from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  listProjectAssets: vi.fn(),
  createProjectAsset: vi.fn(),
  createProjectAssetFromUrl: vi.fn(),
  deleteAsset: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
}));

import * as api from '../lib/api';
import FichiersPanel from '../components/projet/FichiersPanel';

function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg',
    chapterId: 'c1',
    title: 'Page',
    stage: 'scenario',
    position: 0,
    fileTags: [],
    linkedFileIds: [],
    linkedFiles: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    openCorrectionCount: 0, openCorrectionTypes: [],
    createdById: null, handoff: null, scenarioUnsaved: false,
    ...over,
  };
}

const pages = [
  makePage({ id: 'pg7', title: 'Page 7' }),
  makePage({ id: 'pg6', title: 'Page 6', stage: 'nemu' }),
];

// R5-6: chapter-scoped auto-numbering means two cards can legitimately share a title.
const chapters: WorkspaceChapter[] = [
  { id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 },
  { id: 'c2', number: 2, title: 'La rencontre', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 },
];

const dessin: AssetItem = {
  id: 'a1',
  type: 'dessin',
  filename: 'ruelle-nemu.png',
  currentVersion: 1,
  size: 2_400_000,
  thumbnailUrl: 'https://cdn/thumb.webp',
  previewable: true,
  linkedPages: [],
  updatedAt: '2026-07-13T10:00:00.000Z',
};

function listResponse(items: AssetItem[]): AssetListResponse {
  return { items, total: items.length, page: 1, pageSize: 24, totalPages: 1 };
}

const readyMedia: MediaResponse = {
  id: 'm3',
  kind: 'asset',
  status: 'ready',
  visibility: 'private',
  width: 100,
  height: 100,
  variants: { orig: 'o', web: 'w', thumb: 't' },
  createdAt: '2026-07-13T11:00:00.000Z',
};

let capturedXHR: { onload: (() => void) | null } | undefined;
const XHRMock = vi.fn().mockImplementation(function () {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn().mockImplementation(() => queueMicrotask(() => xhr.onload?.())),
    abort: vi.fn(),
    upload: { onprogress: null as ((e: Partial<ProgressEvent>) => void) | null },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    status: 200,
  };
  capturedXHR = xhr;
  return xhr;
});

function renderPanel(props?: { readOnly?: boolean; pages?: WorkspacePage[] }) {
  const { pages: p = pages, ...rest } = props ?? {};
  return render(<FichiersPanel slug="lames-de-brume" pages={p} chapters={chapters} {...rest} />);
}

describe('FichiersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('XMLHttpRequest', XHRMock);
    vi.mocked(api.listProjectAssets).mockResolvedValue(listResponse([dessin]));
    vi.mocked(api.requestUpload).mockResolvedValue({
      mediaId: 'm3',
      uploadUrl: 'https://minio.test/asset/m3.png',
      bucketKey: 'asset/m3.png',
      expiresIn: 300,
    });
    vi.mocked(api.finalizeMedia).mockResolvedValue(readyMedia);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the replica layout: heading, drop zone, hint, source buttons', async () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Importer dessins & textes' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Glissez vos fichiers ici/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('images (.png .jpg) · dessin (.psd .clip .kra .procreate …) · textes (.txt .docx) · scénarios'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parcourir…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tablette' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cloud' })).toBeDisabled();
    expect(screen.getByText('Importés récemment')).toBeInTheDocument();
    await screen.findByText('ruelle-nemu.png');
  });

  it('renders a grid card with chip, French size and version badge', async () => {
    renderPanel();
    const name = await screen.findByText('ruelle-nemu.png');
    const card = name.closest('[data-asset-card]') as HTMLElement;
    expect(within(card).getByText(/Dessin/)).toBeInTheDocument();
    expect(within(card).getByText(/2,4 Mo/)).toBeInTheDocument();
    expect(within(card).getByText('v1')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Aperçu/ })).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Lier ruelle-nemu.png à une carte' }),
    ).toBeInTheDocument();
  });

  it('shows a single card-title chip when linked to one card', async () => {
    vi.mocked(api.listProjectAssets).mockResolvedValue(
      listResponse([{ ...dessin, linkedPages: [{ id: 'pg7', title: 'Page 7' }] }]),
    );
    renderPanel();
    const card = (await screen.findByText('ruelle-nemu.png')).closest('[data-asset-card]') as HTMLElement;
    expect(within(card).getByText('Page 7')).toBeInTheDocument();
  });

  it('shows a "Liée à N cartes" chip when linked to several cards', async () => {
    vi.mocked(api.listProjectAssets).mockResolvedValue(
      listResponse([
        {
          ...dessin,
          type: 'scenario',
          linkedPages: [
            { id: 'pg7', title: 'Page 7' },
            { id: 'pg8', title: 'Page 8' },
          ],
        },
      ]),
    );
    renderPanel();
    const card = (await screen.findByText('ruelle-nemu.png')).closest('[data-asset-card]') as HTMLElement;
    expect(within(card).getByText('Liée à 2 cartes')).toBeInTheDocument();
    expect(within(card).getByTitle('Page 7 · Page 8')).toBeInTheDocument();
  });

  it('shows the empty state when there are no files', async () => {
    vi.mocked(api.listProjectAssets).mockResolvedValue(listResponse([]));
    renderPanel();
    expect(await screen.findByText('Aucun fichier importé')).toBeInTheDocument();
  });

  it('filters by type when a tab is selected', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('button', { name: 'Dessins' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith(
        'lames-de-brume',
        expect.objectContaining({ type: 'dessin' }),
      ),
    );
  });

  it('debounced search auto-applies the q filter', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.type(screen.getByPlaceholderText('Rechercher un fichier…'), 'ruelle');
    await waitFor(
      () =>
        expect(api.listProjectAssets).toHaveBeenLastCalledWith(
          'lames-de-brume',
          expect.objectContaining({ q: 'ruelle' }),
        ),
      { timeout: 2000 },
    );
  });

  it('maps the sort control to the sort param', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('combobox', { name: 'Trier les fichiers' }));
    await userEvent.click(screen.getByRole('option', { name: 'Nom A–Z' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith(
        'lames-de-brume',
        expect.objectContaining({ sort: 'name' }),
      ),
    );
  });

  it('maps the card filter to the pageId param and clears with Réinitialiser', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par carte' }));
    // R5-6c: the option now carries the chapter alongside the title.
    await userEvent.click(screen.getByRole('option', { name: 'Page 7 · Prologue' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith(
        'lames-de-brume',
        expect.objectContaining({ pageId: 'pg7' }),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith('lames-de-brume', {}),
    );
  });

  // R5-6c — « Page 3 » alone is ambiguous across chapters; the option carries the chapter label.
  it('names the chapter in the card filter options, with no native select in the DOM', async () => {
    const { container } = renderPanel({
      pages: [
        makePage({ id: 'a', chapterId: 'c1', title: 'Page 3' }),
        makePage({ id: 'b', chapterId: 'c2', title: 'Page 3' }),
      ],
    });
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par carte' }));

    expect(screen.getByRole('option', { name: 'Page 3 · Prologue' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Page 3 · Ch. 2' })).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows the filtered-empty message', async () => {
    vi.mocked(api.listProjectAssets)
      .mockResolvedValueOnce(listResponse([dessin]))
      .mockResolvedValue(listResponse([]));
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('button', { name: 'Scénarios' }));
    expect(await screen.findByText('Aucun fichier ne correspond')).toBeInTheDocument();
  });

  it('rejects an unsupported file before any network call', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const bad = new File(['x'], 'archive.zip', { type: 'application/zip' });
    // applyAccept:false → exercise the JS validation directly (the drop-zone/drag-drop path bypasses
    // the input's `accept` filter, so validateAssetFile stays the real gate for unsupported types).
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), bad, { applyAccept: false });
    expect(
      await screen.findByText(/Format non pris en charge/),
    ).toBeInTheDocument();
    expect(api.requestUpload).not.toHaveBeenCalled();
  });

  it('rejects an oversize file before any network call', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const big = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), big);
    expect(await screen.findByText(/Fichier trop volumineux \(max 10 Mo\)/)).toBeInTheDocument();
    expect(api.requestUpload).not.toHaveBeenCalled();
  });

  // CS-3 (2026-07-13): drawing-source formats are accepted by extension (browser reports no MIME).
  it('accepts a .clip drawing-source file (uploads as octet-stream, no size rejection)', async () => {
    vi.mocked(api.createProjectAsset).mockResolvedValue({ ...dessin, id: 'a3', filename: 'planche.clip' });
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const clip = new File(['x'], 'planche.clip', { type: '' }); // no browser MIME
    Object.defineProperty(clip, 'size', { value: 80 * 1024 * 1024 }); // 80 MB — over the 10 MB image cap, under 200 MB
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), clip);
    await waitFor(() =>
      expect(api.requestUpload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'asset', contentType: 'application/octet-stream' }),
      ),
    );
  });

  it('rejects a drawing-source file over the 200 Mo cap before any network call', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const huge = new File(['x'], 'huge.kra', { type: '' });
    Object.defineProperty(huge, 'size', { value: 201 * 1024 * 1024 });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), huge);
    expect(await screen.findByText(/Fichier trop volumineux \(max 200 Mo\)/)).toBeInTheDocument();
    expect(api.requestUpload).not.toHaveBeenCalled();
  });

  it('registers a successful upload via createProjectAsset', async () => {
    vi.mocked(api.createProjectAsset).mockResolvedValue({ ...dessin, id: 'a2', filename: 'ok.png' });
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const ok = new File(['x'], 'ok.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), ok);
    await waitFor(() =>
      expect(api.createProjectAsset).toHaveBeenCalledWith('lames-de-brume', {
        mediaId: 'm3',
        filename: 'ok.png',
      }),
    );
  });

  it('readOnly hides every write affordance but keeps the grid + preview', async () => {
    renderPanel({ readOnly: true });
    await screen.findByText('ruelle-nemu.png');
    expect(screen.queryByRole('button', { name: '＋ Importer' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Glissez vos fichiers ici/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Importer des fichiers')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lier ruelle-nemu.png à une carte' }),
    ).not.toBeInTheDocument();
    // Read-only view stays usable.
    expect(screen.getByRole('button', { name: /Aperçu/ })).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('shows a retry affordance when registration fails', async () => {
    vi.mocked(api.createProjectAsset).mockRejectedValue({ message: 'Boom' });
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    const ok = new File(['x'], 'ok.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), ok);
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  // ── F6 · declared import type ────────────────────────────────────────────────
  it('defaults the Type selector to Automatique and sends no type on import', async () => {
    vi.mocked(api.createProjectAsset).mockResolvedValue({ ...dessin, id: 'a2', filename: 'ok.png' });
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    expect(screen.getByRole('combobox', { name: 'Type de fichier' })).toHaveTextContent('Automatique');
    const ok = new File(['x'], 'ok.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), ok);
    await waitFor(() =>
      expect(api.createProjectAsset).toHaveBeenCalledWith('lames-de-brume', { mediaId: 'm3', filename: 'ok.png' }),
    );
  });

  it('threads a declared "Référence" type into createProjectAsset', async () => {
    vi.mocked(api.createProjectAsset).mockResolvedValue({ ...dessin, id: 'a2', type: 'ref', filename: 'moodboard.png' });
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('combobox', { name: 'Type de fichier' }));
    await userEvent.click(screen.getByRole('option', { name: 'Référence' }));
    const ok = new File(['x'], 'moodboard.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Importer des fichiers'), ok);
    await waitFor(() =>
      expect(api.createProjectAsset).toHaveBeenCalledWith('lames-de-brume', {
        mediaId: 'm3',
        filename: 'moodboard.png',
        type: 'ref',
      }),
    );
  });

  it('exposes Pages and Références filter tabs', async () => {
    renderPanel();
    await screen.findByText('ruelle-nemu.png');
    await userEvent.click(screen.getByRole('button', { name: 'Références' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith(
        'lames-de-brume',
        expect.objectContaining({ type: 'ref' }),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenLastCalledWith(
        'lames-de-brume',
        expect.objectContaining({ type: 'page' }),
      ),
    );
  });

  // ── F9 · delete asset ────────────────────────────────────────────────────────
  it('deletes a grid card after confirming, then refetches', async () => {
    vi.mocked(api.deleteAsset).mockResolvedValue(undefined);
    renderPanel();
    const name = await screen.findByText('ruelle-nemu.png');
    const card = name.closest('[data-asset-card]') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Supprimer ruelle-nemu.png' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Supprimer le fichier/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith('a1'));
    // refetch: listProjectAssets called again after the delete (initial + refresh).
    await waitFor(() => expect(vi.mocked(api.listProjectAssets).mock.calls.length).toBeGreaterThan(1));
  });

  it('cancelling the delete keeps the card and calls nothing', async () => {
    renderPanel();
    const name = await screen.findByText('ruelle-nemu.png');
    const card = name.closest('[data-asset-card]') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Supprimer ruelle-nemu.png' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Supprimer le fichier/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(api.deleteAsset).not.toHaveBeenCalled();
    expect(screen.getByText('ruelle-nemu.png')).toBeInTheDocument();
  });

  // ── F10 · grid card actions are real buttons ────────────────────────────────
  it('renders the grid card actions as real buttons (Aperçu / Lier / Supprimer)', async () => {
    renderPanel();
    const name = await screen.findByText('ruelle-nemu.png');
    const card = name.closest('[data-asset-card]') as HTMLElement;
    expect(within(card).getByRole('button', { name: /Aperçu de ruelle-nemu.png/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Lier ruelle-nemu.png à une carte' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Supprimer ruelle-nemu.png' })).toBeInTheDocument();
  });

  it('readOnly hides the Type selector and Supprimer', async () => {
    renderPanel({ readOnly: true });
    await screen.findByText('ruelle-nemu.png');
    expect(screen.queryByRole('combobox', { name: 'Type de fichier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer ruelle-nemu.png' })).not.toBeInTheDocument();
  });
});
