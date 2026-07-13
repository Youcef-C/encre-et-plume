import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetItem, AssetListResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, listProjectAssets: vi.fn(), linkAssetToPage: vi.fn() };
});

import * as api from '../lib/api';
import LinkAssetPicker from '../components/projet/LinkAssetPicker';

function asset(over: Partial<AssetItem> = {}): AssetItem {
  return {
    id: 'a1',
    type: 'scenario',
    filename: 'scenario.txt',
    currentVersion: 2,
    size: 1024,
    thumbnailUrl: null,
    previewable: true,
    linkedPage: null,
    updatedAt: '2026-07-10T10:00:00.000Z',
    ...over,
  };
}

function listResponse(items: AssetItem[]): AssetListResponse {
  return { items, total: items.length, page: 1, pageSize: 24, totalPages: 1 };
}

function mount(props: Partial<React.ComponentProps<typeof LinkAssetPicker>> = {}) {
  const onClose = vi.fn();
  const onLinked = vi.fn();
  render(
    <LinkAssetPicker
      slug="nuit-blanche"
      pageId="pg7"
      types={['scenario', 'texte']}
      canonicalType="scenario"
      sectionLabel="Scénario"
      onClose={onClose}
      onLinked={onLinked}
      {...props}
    />,
  );
  return { onClose, onLinked };
}

describe('LinkAssetPicker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists all project assets in one fetch (no per-type calls)', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([
        asset({ id: 'a1', filename: 'chapitre.txt', type: 'scenario' }),
        asset({ id: 'a2', filename: 'planche.png', type: 'dessin' }),
      ]),
    );
    mount();
    expect(await screen.findByText('chapitre.txt')).toBeInTheDocument();
    expect(screen.getByText('planche.png')).toBeInTheDocument();
    expect(api.listProjectAssets).toHaveBeenCalledTimes(1);
    expect(api.listProjectAssets).toHaveBeenCalledWith('nuit-blanche', {});
  });

  it('debounces the search then refetches with q', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse([asset()]));
    mount({ types: ['scenario'] });
    await screen.findByText('scenario.txt');
    await userEvent.type(screen.getByLabelText('Rechercher un fichier'), 'dia');
    await waitFor(() =>
      expect(api.listProjectAssets).toHaveBeenCalledWith('nuit-blanche', { q: 'dia' }),
    );
  });

  it('picking a matching-type asset links it without a type override', async () => {
    const linked = asset({ id: 'a1', linkedPage: { id: 'pg7', title: 'Page 7' } });
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse([asset()]));
    (api.linkAssetToPage as ReturnType<typeof vi.fn>).mockResolvedValue(linked);
    const { onLinked } = mount({ types: ['scenario', 'texte'], canonicalType: 'scenario' });
    await userEvent.click(await screen.findByText('scenario.txt'));
    expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' });
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(linked));
  });

  it('reclassifies an out-of-section asset: shows the hint and sends the canonical type', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ id: 'a2', filename: 'planche.png', type: 'dessin', linkedPage: null })]),
    );
    (api.linkAssetToPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      asset({ id: 'a2', type: 'page', filename: 'planche.png', linkedPage: { id: 'pg7', title: 'Page 7' } }),
    );
    mount({ types: ['page'], canonicalType: 'page', sectionLabel: 'PAGE' });
    expect(await screen.findByText(/sera reclassé/)).toHaveTextContent('« Page »');
    await userEvent.click(screen.getByText('planche.png'));
    expect(api.linkAssetToPage).toHaveBeenCalledWith('a2', { pageId: 'pg7', type: 'page' });
  });

  it('marks an asset already linked to another card as "sera re-liée"', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ linkedPage: { id: 'other', title: 'Page 3' } })]),
    );
    mount({ types: ['scenario'] });
    expect(await screen.findByText(/sera re-liée/)).toHaveTextContent('« Page 3 »');
  });

  it('shows an empty state pointing to the Fichiers tab', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse([]));
    mount({ types: ['ref'], canonicalType: 'ref' });
    expect(await screen.findByText(/Aucun fichier/)).toBeInTheDocument();
  });

  it('always offers a link to import a new file from the Fichiers tab', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse([asset()]));
    mount({ types: ['scenario'] });
    const link = await screen.findByRole('link', { name: /Importer depuis Fichiers/ });
    expect(link).toHaveAttribute('href', '/projet/nuit-blanche?tab=fichiers');
  });
});
