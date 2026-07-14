import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetItem, AssetVersionItem, MediaResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getAssetVersions: vi.fn(),
  addAssetVersion: vi.fn(),
  setAssetActiveVersion: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
}));

import * as api from '../lib/api';
import AssetVersionsModal from '../components/projet/AssetVersionsModal';

const asset: AssetItem = {
  id: 'a1',
  type: 'dessin',
  filename: 'ruelle-nemu.png',
  currentVersion: 2,
  size: 2_400_000,
  thumbnailUrl: null,
  previewable: true,
  linkedPages: [],
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const versions: AssetVersionItem[] = [
  {
    version: 2,
    mediaId: 'm2',
    size: 2_400_000,
    note: 'Encrage final',
    authorId: 'u1',
    authorName: 'Camille',
    createdAt: '2026-07-13T10:00:00.000Z',
    thumbnailUrl: null,
    active: true,
  },
  {
    version: 1,
    mediaId: 'm1',
    size: 1_100_000,
    note: null,
    authorId: 'u1',
    authorName: 'Camille',
    createdAt: '2026-07-12T09:00:00.000Z',
    thumbnailUrl: null,
    active: false,
  },
];

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

// XHR stub — resolves the PUT immediately on send().
let capturedXHR: { onload: (() => void) | null; status: number } | undefined;
const XHRMock = vi.fn().mockImplementation(function () {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn().mockImplementation(function (this: { onload: (() => void) | null }) {
      queueMicrotask(() => xhr.onload?.());
    }),
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

describe('AssetVersionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('XMLHttpRequest', XHRMock);
    vi.mocked(api.getAssetVersions).mockResolvedValue(versions);
    vi.mocked(api.requestUpload).mockResolvedValue({
      mediaId: 'm3',
      uploadUrl: 'https://minio.test/asset/m3.png',
      bucketKey: 'asset/m3.png',
      expiresIn: 300,
    });
    vi.mocked(api.finalizeMedia).mockResolvedValue(readyMedia);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists v1…vN with note, date and author', async () => {
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(await screen.findByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Encrage final')).toBeInTheDocument();
    expect(screen.getAllByText(/Camille/).length).toBeGreaterThan(0);
  });

  it('uploads a new version ending in addAssetVersion', async () => {
    const updated: AssetItem = { ...asset, currentVersion: 3 };
    vi.mocked(api.addAssetVersion).mockResolvedValue(updated);
    const onUpdated = vi.fn();
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={vi.fn()} onUpdated={onUpdated} />);
    await screen.findByText('v2');

    const file = new File(['x'], 'ruelle-nemu.png', { type: 'image/png' });
    const input = screen.getByLabelText('Choisir un fichier pour la nouvelle version');
    await userEvent.upload(input, file);

    await waitFor(() =>
      expect(api.addAssetVersion).toHaveBeenCalledWith(
        's1',
        'a1',
        expect.objectContaining({ mediaId: 'm3' }),
      ),
    );
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('marks the active version and offers "Rendre active" only on the others', async () => {
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText('v2');
    // v2 is active → badge, no switch button; v1 is not → switch button, no badge.
    expect(screen.getByText('Version active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rendre active la version 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rendre active la version 2/ })).not.toBeInTheDocument();
  });

  it('switches the active version: calls setAssetActiveVersion, bubbles the asset, reloads the list', async () => {
    const updated: AssetItem = { ...asset, currentVersion: 1 };
    vi.mocked(api.setAssetActiveVersion).mockResolvedValue(updated);
    const onUpdated = vi.fn();
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={vi.fn()} onUpdated={onUpdated} />);
    await screen.findByText('v2');

    await userEvent.click(screen.getByRole('button', { name: /Rendre active la version 1/ }));

    await waitFor(() => expect(api.setAssetActiveVersion).toHaveBeenCalledWith('a1', 1));
    expect(onUpdated).toHaveBeenCalledWith(updated);
    // The list is re-fetched so the active badge follows the switch.
    expect(api.getAssetVersions).toHaveBeenCalledTimes(2);
  });

  it('keeps focus inside the dialog after activating a version, so Escape still closes', async () => {
    const updated: AssetItem = { ...asset, currentVersion: 1 };
    vi.mocked(api.setAssetActiveVersion).mockResolvedValue(updated);
    // After the switch the list reloads with v1 active → v1's "Rendre active" button unmounts.
    const flipped: AssetVersionItem[] = [
      { ...versions[0], active: false },
      { ...versions[1], active: true },
    ];
    vi.mocked(api.getAssetVersions).mockResolvedValueOnce(versions).mockResolvedValue(flipped);
    const onClose = vi.fn();
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={onClose} onUpdated={vi.fn()} />);
    await screen.findByText('v2');

    await userEvent.click(screen.getByRole('button', { name: /Rendre active la version 1/ }));

    // The clicked row's button is replaced by the "Version active" badge…
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Rendre active la version 1/ })).not.toBeInTheDocument(),
    );
    // …but focus must stay inside the dialog, not drop to <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    // Escape still closes because the keydown reaches the dialog's onKeyDown.
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('read-only viewers cannot switch the active version', async () => {
    render(<AssetVersionsModal slug="s1" asset={asset} readOnly onClose={vi.fn()} onUpdated={vi.fn()} />);
    await screen.findByText('v2');
    expect(screen.getByText('Version active')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rendre active/ })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<AssetVersionsModal slug="s1" asset={asset} onClose={onClose} onUpdated={vi.fn()} />);
    await screen.findByText('v2');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
