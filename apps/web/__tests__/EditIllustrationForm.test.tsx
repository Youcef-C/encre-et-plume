// DR-12 iter3 V12 — EditIllustrationForm. Seeds every field from IllustrationDetail (incl. Visibilité
// "Publique" when publishedAt is set), blocks an empty Titre, saves the full editable set via
// updateIllustration and fires onSaved with the response; an API error shows a French notice.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IllustrationDetail } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, updateIllustration: vi.fn(), deleteIllustration: vi.fn() };
});

// Stub the F-10 image slot: exposes a button that fires onUploaded with a ready Media so we can
// assert the modal forwards the new media id as PATCH `image`.
vi.mock('../components/UploadControl', () => ({
  default: ({
    label,
    onUploaded,
  }: {
    label: string;
    onUploaded: (m: { id: string }) => void;
  }) => (
    <div>
      {label}
      <button type="button" onClick={() => onUploaded({ id: 'media-new' })}>
        FAKE_UPLOAD
      </button>
    </div>
  ),
}));

import * as api from '../lib/api';
import EditIllustrationForm from '../components/illustration/EditIllustrationForm';

function makeDetail(overrides: Partial<IllustrationDetail> = {}): IllustrationDetail {
  return {
    id: 'ill-1', title: 'Aube', description: 'Une aube.', category: 'personnages', categoryLabel: 'Personnages',
    genres: [], hashtags: ['encre'], image: null, dimensionsLabel: null, tools: 'Encre · CSP', license: null,
    likeCount: 0, publishedAt: '2026-01-01T00:00:00.000Z',
    artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
    is18plus: false, collections: [],
    ...overrides,
  };
}

describe('EditIllustrationForm (DR-12 FE-13 · V12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds every field from the detail (Visibilité "Publique" when publishedAt is set)', () => {
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Aube');
    expect((screen.getByLabelText('Outils') as HTMLInputElement).value).toBe('Encre · CSP');
    expect(screen.getByText('#encre')).toBeInTheDocument();
    // Visibility select seeded to "Publique".
    expect(screen.getByRole('combobox', { name: /Visibilité/ })).toHaveTextContent('Publique');
  });

  it('seeds Visibilité "Privée" when the piece is unpublished', () => {
    render(<EditIllustrationForm detail={makeDetail({ publishedAt: null })} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /Visibilité/ })).toHaveTextContent('Privée');
  });

  it('blocks an empty Titre with "Un titre est requis"', async () => {
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);
    await user.clear(screen.getByLabelText('Titre'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Un titre est requis')).toBeInTheDocument();
    expect(api.updateIllustration).not.toHaveBeenCalled();
  });

  it('saves the full editable set and fires onSaved with the response', async () => {
    const saved = makeDetail({ title: 'Crépuscule' });
    vi.mocked(api.updateIllustration).mockResolvedValue(saved);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={onSaved} onClose={vi.fn()} />);

    await user.clear(screen.getByLabelText('Titre'));
    await user.type(screen.getByLabelText('Titre'), 'Crépuscule');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      // CS-13: Licence is now a select seeded to the © default when the detail's licence is null.
      expect(api.updateIllustration).toHaveBeenCalledWith('ill-1', {
        title: 'Crépuscule',
        category: 'personnages',
        description: 'Une aube.',
        hashtags: ['encre'],
        tools: 'Encre · CSP',
        license: '© Tous droits réservés',
        visibility: 'public',
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('sends the replacement media id as `image` after an upload (CS-13)', async () => {
    vi.mocked(api.updateIllustration).mockResolvedValue(makeDetail());
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'FAKE_UPLOAD' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(api.updateIllustration).toHaveBeenCalledWith(
        'ill-1',
        expect.objectContaining({ image: 'media-new' }),
      ),
    );
  });

  it('deletes the illustration via the on-brand confirm MODAL and redirects to /galerie', async () => {
    vi.mocked(api.deleteIllustration).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);

    // The footer button opens a confirm modal (no native window.confirm, no inline confirm).
    await user.click(screen.getByRole('button', { name: /Supprimer l’illustration/ }));
    const modal = screen.getByRole('alertdialog', { name: "Supprimer l'illustration" });
    expect(api.deleteIllustration).not.toHaveBeenCalled();
    await user.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(api.deleteIllustration).toHaveBeenCalledWith('ill-1'));
    expect(push).toHaveBeenCalledWith('/galerie');
  });

  it('cancelling the confirm modal closes it and does not delete', async () => {
    vi.mocked(api.deleteIllustration).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Supprimer l’illustration/ }));
    const modal = screen.getByRole('alertdialog', { name: "Supprimer l'illustration" });
    await user.click(within(modal).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.deleteIllustration).not.toHaveBeenCalled();
  });

  it('shows a French notice in the modal when the deletion fails', async () => {
    vi.mocked(api.deleteIllustration).mockRejectedValue({ statusCode: 500, message: 'Suppression impossible', error: 'ERR' });
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Supprimer l’illustration/ }));
    const modal = screen.getByRole('alertdialog', { name: "Supprimer l'illustration" });
    await user.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText('Suppression impossible')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a French notice and keeps values on an API error', async () => {
    vi.mocked(api.updateIllustration).mockRejectedValue({ statusCode: 400, message: 'Catégorie invalide', error: 'BAD_REQUEST' });
    const user = userEvent.setup();
    render(<EditIllustrationForm detail={makeDetail()} onSaved={vi.fn()} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Catégorie invalide')).toBeInTheDocument();
    expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Aube');
  });
});
