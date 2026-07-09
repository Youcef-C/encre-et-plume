// DR-12 V1 — PublishIllustrationForm. Title required blocks submit; the "Ajouter à une collection"
// multiselect shows removable chips outside the trigger; submit posts PublishIllustrationRequest
// (incl. collectionIds) and navigates to the new illustration; a failure preserves the form values.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionSummary, PublishIllustrationRequest } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyCollections: vi.fn(),
    publishIllustration: vi.fn(),
  };
});

vi.mock('../components/UploadControl', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

import * as api from '../lib/api';
import PublishIllustrationForm from '../components/creer/PublishIllustrationForm';

const collections: CollectionSummary[] = [
  { id: 'c1', slug: 'carnet', title: "Carnet d'Encre", cover: null, count: 3 },
];

describe('PublishIllustrationForm (DR-12 V1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getMyCollections as ReturnType<typeof vi.fn>).mockResolvedValue(collections);
    (api.publishIllustration as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ill-9' });
  });

  it('blocks submit with an inline error when the title is empty', async () => {
    const user = userEvent.setup();
    render(<PublishIllustrationForm />);
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText('Un titre est requis')).toBeInTheDocument();
    expect(api.publishIllustration).not.toHaveBeenCalled();
  });

  it('assigns a collection (chip removable outside the trigger) and publishes with collectionIds', async () => {
    const user = userEvent.setup();
    render(<PublishIllustrationForm />);
    await waitFor(() => expect(api.getMyCollections).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Titre'), 'Aube');

    // Open the multiselect and pick the collection.
    await user.click(screen.getByRole('button', { name: /Ajouter à une collection/ }));
    await user.click(await screen.findByRole('checkbox', { name: "Carnet d'Encre" }));
    // Close the popover so only the chip row outside the trigger remains.
    await user.keyboard('{Escape}');

    // The selected value is shown as a removable chip OUTSIDE the trigger.
    const chipRemove = await screen.findByRole('button', { name: "Retirer Carnet d'Encre" });
    expect(chipRemove).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publier' }));

    await waitFor(() => expect(api.publishIllustration).toHaveBeenCalledTimes(1));
    const body = (api.publishIllustration as ReturnType<typeof vi.fn>).mock.calls[0][0] as PublishIllustrationRequest;
    expect(body.title).toBe('Aube');
    expect(body.collectionIds).toEqual(['c1']);
    expect(body.category).toBe('personnages');
    expect(push).toHaveBeenCalledWith('/illustration/ill-9');
  });

  it('includes freetext hashtags in the publish body (DR-12 iter2 FE-9)', async () => {
    const user = userEvent.setup();
    render(<PublishIllustrationForm />);
    await user.type(screen.getByLabelText('Titre'), 'Aube');
    await user.type(screen.getByLabelText('Hashtags'), '#Encre noir ');
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(api.publishIllustration).toHaveBeenCalledTimes(1));
    const body = (api.publishIllustration as ReturnType<typeof vi.fn>).mock.calls[0][0] as PublishIllustrationRequest;
    expect(body.hashtags).toEqual(['encre', 'noir']);
  });

  it('keeps the form values when the publish request fails', async () => {
    (api.publishIllustration as ReturnType<typeof vi.fn>).mockRejectedValue({ message: 'Erreur serveur' });
    const user = userEvent.setup();
    render(<PublishIllustrationForm />);
    await user.type(screen.getByLabelText('Titre'), 'Aube');
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText('Erreur serveur')).toBeInTheDocument();
    expect(screen.getByLabelText('Titre')).toHaveValue('Aube');
  });
});
