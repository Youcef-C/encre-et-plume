// DR-5 FE-10 — quick-preview overlay ("👁 Aperçu rapide" -> QuickPreview). Keyboard-accessible:
// Esc dismisses, focus moves in on open, backdrop click closes, "Voir →" links to DR-6.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { GalleryPreview } from '@encre-et-plume/shared';
import QuickPreview from '../components/galerie/QuickPreview';

const preview: GalleryPreview = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  artistName: 'Yuki Moreau',
  artistSlug: 'dr1-yuki-moreau',
  category: 'couvertures',
  categoryLabel: 'Couvertures',
  likeCount: 12400,
  image: null,
  is18plus: false,
};

describe('QuickPreview (DR-5 FE-10)', () => {
  it('shows a loading state while the preview fetches', () => {
    render(<QuickPreview id="dr5-illus-1" state="loading" preview={null} onClose={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<QuickPreview id="dr5-illus-1" state="error" preview={null} onClose={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the larger image (alt=title), meta line and a "Voir →" link into DR-6', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'Pluie de Néons' })).toBeInTheDocument();
    expect(screen.getByText(/Yuki Moreau/)).toBeInTheDocument();
    expect(screen.getByText(/12,4k/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir/ })).toHaveAttribute('href', '/illustration/dr5-illus-1');
  });

  it('is a labelled dialog', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Pluie de Néons' })).toBeInTheDocument();
  });

  it('Escape closes the overlay', () => {
    const onClose = vi.fn();
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the close button dismisses the overlay', () => {
    const onClose = vi.fn();
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus into the dialog on open', async () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  });

  // Round 2 regression (user note 2026-07-04): the ✕ used `float: right`, which disturbed the
  // dialog's content flow. It must be taken fully out of flow (position: absolute, anchored to
  // the dialog panel) so content never reflows/shifts around it — same family of fix as
  // ProfilePageClient's AvatarLightbox close button.
  it('anchors the close button with position:absolute (not float), so it never disturbs content flow', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={() => {}} />);
    const closeButton = screen.getByRole('button', { name: 'Fermer' });
    expect(closeButton).toHaveStyle({ position: 'absolute' });
    expect(closeButton).not.toHaveStyle({ float: 'right' });
  });

  // ── DR-10: 18+ blur + badge ──────────────────────────────────────────────────

  it('blurs the preview image and shows an "18+" badge for an 18+ illustration', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={{ ...preview, is18plus: true }} onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'Illustration 18+' })).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ illustration preview', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={preview} onClose={() => {}} />);
    expect(screen.queryByRole('img', { name: 'Illustration 18+' })).not.toBeInTheDocument();
  });

  it('QA round-1 regression: the cover box keeps its exact 320px height when is18plus (no stretch)', () => {
    render(<QuickPreview id="dr5-illus-1" state="ready" preview={{ ...preview, is18plus: true }} onClose={() => {}} />);
    expect(screen.getByTestId('quick-preview-cover')).toHaveStyle({ height: '320px' });
  });

  it('the close button renders and dismisses identically across loading/error/ready states', () => {
    for (const state of ['loading', 'error', 'ready'] as const) {
      const onClose = vi.fn();
      const { unmount } = render(
        <QuickPreview id="dr5-illus-1" state={state} preview={state === 'ready' ? preview : null} onClose={onClose} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(onClose).toHaveBeenCalled();
      unmount();
    }
  });
});
