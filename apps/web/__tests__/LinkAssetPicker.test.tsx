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
    linkedPages: [],
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
    const linked = asset({ id: 'a1', linkedPages: [{ id: 'pg7', title: 'Page 7' }] });
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(listResponse([asset()]));
    (api.linkAssetToPage as ReturnType<typeof vi.fn>).mockResolvedValue(linked);
    const { onLinked } = mount({ types: ['scenario', 'texte'], canonicalType: 'scenario' });
    await userEvent.click(await screen.findByText('scenario.txt'));
    expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' });
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(linked));
  });

  it('reclassifies an out-of-section asset: shows the hint and sends the canonical type', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ id: 'a2', filename: 'planche.png', type: 'dessin', linkedPages: [] })]),
    );
    (api.linkAssetToPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      asset({ id: 'a2', type: 'page', filename: 'planche.png', linkedPages: [{ id: 'pg7', title: 'Page 7' }] }),
    );
    mount({ types: ['page'], canonicalType: 'page', sectionLabel: 'PAGE' });
    expect(await screen.findByText(/sera reclassé/)).toHaveTextContent('« Page »');
    await userEvent.click(screen.getByText('planche.png'));
    expect(api.linkAssetToPage).toHaveBeenCalledWith('a2', { pageId: 'pg7', type: 'page' });
  });

  it('single type: header is "Lier · remplacer" and an asset linked elsewhere shows "sera re-liée"', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ id: 'a2', type: 'page', filename: 'planche.png', linkedPages: [{ id: 'other', title: 'Page 3' }] })]),
    );
    mount({ types: ['page'], canonicalType: 'page', sectionLabel: 'PAGE' });
    expect(await screen.findByText('Lier · remplacer')).toBeInTheDocument();
    expect(await screen.findByText(/sera re-liée/)).toHaveTextContent('« Page 3 »');
  });

  it('shared type: header is "Lier · ajouter" and an asset linked to ONE other card shows "sera aussi liée ici"', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ linkedPages: [{ id: 'other', title: 'Page 3' }] })]),
    );
    mount({ types: ['scenario', 'texte'], canonicalType: 'scenario' });
    expect(await screen.findByText('Lier · ajouter')).toBeInTheDocument();
    expect(await screen.findByText(/sera aussi liée ici/)).toHaveTextContent('« Page 3 »');
  });

  it('shared type: an asset linked to N>1 other cards shows "liée à N cartes"', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([
        asset({ linkedPages: [{ id: 'other', title: 'Page 3' }, { id: 'other2', title: 'Page 4' }] }),
      ]),
    );
    mount({ types: ['scenario', 'texte'], canonicalType: 'scenario' });
    expect(await screen.findByText(/liée à 2 cartes — sera aussi liée ici/)).toBeInTheDocument();
  });

  it('shared type: an asset already linked to THIS card is disabled with "déjà liée à cette carte"', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      listResponse([asset({ linkedPages: [{ id: 'pg7', title: 'Page 7' }] })]),
    );
    mount({ types: ['scenario', 'texte'], canonicalType: 'scenario' });
    expect(await screen.findByText('déjà liée à cette carte')).toBeInTheDocument();
    // The row button is disabled — the add would be a no-op.
    expect(screen.getByText('scenario.txt').closest('button')).toBeDisabled();
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
