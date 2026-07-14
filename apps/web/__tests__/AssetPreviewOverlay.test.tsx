import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetPreviewResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getAssetPreview: vi.fn(),
}));

import * as api from '../lib/api';
import AssetPreviewOverlay from '../components/projet/AssetPreviewOverlay';

const base = { downloadUrl: 'https://cdn/orig', filename: 'scenario-ch5.docx', version: 3 };

function renderOverlay(res: AssetPreviewResponse, onClose = vi.fn()) {
  vi.mocked(api.getAssetPreview).mockResolvedValue(res);
  render(
    <AssetPreviewOverlay assetId="a1" filename="scenario-ch5.docx" version={3} onClose={onClose} />,
  );
  return onClose;
}

describe('AssetPreviewOverlay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an image preview', async () => {
    renderOverlay({ mode: 'image', url: 'https://cdn/web.webp', ...base });
    const img = await screen.findByAltText('scenario-ch5.docx');
    expect(img).toHaveAttribute('src', 'https://cdn/web.webp');
  });

  it('renders a PDF in an iframe (no sandbox, so the native PDF viewer runs) with an open-in-tab fallback', async () => {
    renderOverlay({ mode: 'pdf', url: 'https://cdn/doc.pdf', ...base });
    await waitFor(() => {
      const frame = document.querySelector('iframe');
      expect(frame).toHaveAttribute('src', 'https://cdn/doc.pdf');
      // No sandbox: sandbox="" disables the browser PDF viewer (blank frame). The src is a
      // cross-origin signed URL, already isolated from app cookies by the same-origin policy.
      expect(frame).not.toHaveAttribute('sandbox');
    });
    const fallback = screen.getByRole('link', { name: /Ouvrir dans un nouvel onglet/ });
    expect(fallback).toHaveAttribute('href', 'https://cdn/doc.pdf');
  });

  it('renders plain text', async () => {
    renderOverlay({ mode: 'text', text: 'Bonjour le monde', ...base });
    expect(await screen.findByText('Bonjour le monde')).toBeInTheDocument();
  });

  it('renders docx HTML', async () => {
    renderOverlay({ mode: 'html', html: '<p>Chapitre <b>cinq</b></p>', ...base });
    await waitFor(() => expect(screen.getByText('cinq')).toBeInTheDocument());
  });

  it('shows the processing state', async () => {
    renderOverlay({ mode: 'processing', ...base });
    expect(await screen.findByText('Conversion en cours…')).toBeInTheDocument();
  });

  it('shows the unavailable state', async () => {
    renderOverlay({ mode: 'unavailable', ...base });
    expect(await screen.findByText('Aperçu indisponible pour ce format')).toBeInTheDocument();
  });

  it('exposes a Télécharger link pointing at downloadUrl', async () => {
    renderOverlay({ mode: 'image', url: 'https://cdn/web.webp', ...base });
    const dl = await screen.findByRole('link', { name: 'Télécharger' });
    expect(dl).toHaveAttribute('href', 'https://cdn/orig');
  });

  it('closes on Escape', async () => {
    const onClose = renderOverlay({ mode: 'image', url: 'https://cdn/web.webp', ...base });
    await screen.findByAltText('scenario-ch5.docx');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
