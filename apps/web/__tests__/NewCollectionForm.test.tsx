// DR-12 V2 — NewCollectionForm (inline collection create). Title required, genres via
// GenreSuggestInput, tier/goal rows, euro→cents conversion, posts CreateCollectionRequest and
// hands the returned CollectionSummary back to the parent.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionSummary, CreateCollectionRequest } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createCollection: vi.fn(),
    getActiveContest: vi.fn().mockResolvedValue(null),
  };
});

// UploadControl pulls the media pipeline; stub it out for the form test.
vi.mock('../components/UploadControl', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

import * as api from '../lib/api';
import NewCollectionForm from '../components/collections/NewCollectionForm';

const summary: CollectionSummary = { id: 'w1', slug: 'carnet', title: "Carnet d'Encre", cover: null, count: 0 };

describe('NewCollectionForm (DR-12 V2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getActiveContest as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (api.createCollection as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
  });

  it('portals the dialog to document.body above the navbar (z-index >= 100)', () => {
    const { container } = render(<NewCollectionForm onClose={() => {}} onCreated={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: /Nouvelle collection/i });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    const overlay = dialog.parentElement!;
    expect(Number(overlay.style.zIndex)).toBeGreaterThanOrEqual(100);
  });

  it('blocks submit with an inline error when the title is empty', async () => {
    const user = userEvent.setup();
    render(<NewCollectionForm onClose={() => {}} onCreated={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Créer la collection' }));
    expect(await screen.findByText('Un titre est requis')).toBeInTheDocument();
    expect(api.createCollection).not.toHaveBeenCalled();
  });

  it('posts CreateCollectionRequest with genres ids, tiers/goals in cents, and returns the summary', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<NewCollectionForm onClose={() => {}} onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Titre'), "Carnet d'Encre");

    // Genre via the vocabulary-restricted input (adds a chip).
    const genreInput = screen.getByLabelText('Ajouter un genre');
    await user.type(genreInput, 'Action');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Retirer Action' })).toBeInTheDocument();

    // One support tier (name + €/mois) — euro converts to cents.
    await user.click(screen.getByRole('button', { name: '＋ Ajouter un palier' }));
    await user.type(screen.getByLabelText('Nom du palier 1'), 'Mécène');
    await user.type(screen.getByLabelText('Prix mensuel du palier 1 (€)'), '5');

    // One funding goal (title + cible €).
    await user.click(screen.getByRole('button', { name: '＋ Ajouter un objectif' }));
    await user.type(screen.getByLabelText('Titre de l’objectif 1'), 'Papier premium');
    await user.type(screen.getByLabelText('Cible de l’objectif 1 (€)'), '200');

    await user.click(screen.getByRole('button', { name: 'Créer la collection' }));

    await waitFor(() => expect(api.createCollection).toHaveBeenCalledTimes(1));
    const body = (api.createCollection as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateCollectionRequest;
    expect(body.title).toBe("Carnet d'Encre");
    expect(body.genres).toEqual(['action']);
    expect(body.tiers).toEqual([{ name: 'Mécène', priceCents: 500 }]);
    expect(body.goals).toEqual([{ title: 'Papier premium', targetCents: 20000 }]);
    expect(onCreated).toHaveBeenCalledWith(summary);
  });

  it('includes freetext hashtags in the create body (DR-12 iter2 FE-9)', async () => {
    const user = userEvent.setup();
    render(<NewCollectionForm onClose={() => {}} onCreated={() => {}} />);
    await user.type(screen.getByLabelText('Titre'), "Carnet d'Encre");
    await user.type(screen.getByLabelText('Hashtags'), '#Encre noir ');
    await user.click(screen.getByRole('button', { name: 'Créer la collection' }));
    await waitFor(() => expect(api.createCollection).toHaveBeenCalledTimes(1));
    const body = (api.createCollection as ReturnType<typeof vi.fn>).mock.calls[0][0] as CreateCollectionRequest;
    expect(body.hashtags).toEqual(['encre', 'noir']);
  });
});
