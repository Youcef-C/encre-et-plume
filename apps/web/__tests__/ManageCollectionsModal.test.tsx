// DR-12 — "Gérer les collections" management modal on the illustration Collections box.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionChip, CollectionSummary } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyCollections: vi.fn(),
    addCollectionIllustration: vi.fn(),
    removeCollectionIllustration: vi.fn(),
  };
});

// Stub NewCollectionForm — the modal's create flow only needs the onCreated hand-off; the real form
// (uploads, contest fetch) is covered by its own suite.
vi.mock('../components/collections/NewCollectionForm', () => ({
  default: ({ onCreated, onClose }: { onCreated: (c: CollectionSummary) => void; onClose: () => void }) => (
    <button
      type="button"
      onClick={() => {
        onCreated({ id: 'col-new', slug: 'nouvelle', title: 'Nouvelle', cover: null, count: 0 });
        onClose();
      }}
    >
      stub-create
    </button>
  ),
}));

import * as api from '../lib/api';
import ManageCollectionsModal from '../components/illustration/ManageCollectionsModal';

const myCollections: CollectionSummary[] = [
  { id: 'col-a', slug: 'carnet-a', title: 'Carnet A', cover: null, count: 3 },
  { id: 'col-b', slug: 'recueil-b', title: 'Recueil B', cover: null, count: 1 },
  { id: 'col-c', slug: 'serie-c', title: 'Série C', cover: null, count: 0 },
];
const currentCollections: CollectionChip[] = [{ id: 'col-a', slug: 'carnet-a', title: 'Carnet A', cover: null }];

function setup(overrides: Partial<React.ComponentProps<typeof ManageCollectionsModal>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const { container } = render(
    <ManageCollectionsModal
      illustrationId="illus-1"
      currentCollections={currentCollections}
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onSaved, container };
}

describe('ManageCollectionsModal (DR-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyCollections).mockResolvedValue(myCollections);
    vi.mocked(api.addCollectionIllustration).mockResolvedValue({} as never);
    vi.mocked(api.removeCollectionIllustration).mockResolvedValue(undefined);
  });

  it('loads the artist collections and lists the current member with a "Retirer" action', async () => {
    setup();
    expect(await screen.findByRole('dialog', { name: /Gérer les collections/i })).toBeInTheDocument();
    await waitFor(() => expect(api.getMyCollections).toHaveBeenCalled());
    expect(screen.getByText('Carnet A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
    // Non-member collections are offered to add.
    expect(screen.getByRole('checkbox', { name: 'Recueil B' })).toBeInTheDocument();
  });

  it('batches an add + a remove and only persists them on "Sauvegarder"', async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = setup();
    await screen.findByText('Carnet A');

    await user.click(screen.getByRole('checkbox', { name: 'Recueil B' })); // add col-b
    await user.click(screen.getByRole('button', { name: /Retirer/ })); // remove col-a

    // Nothing hits the API until Sauvegarder.
    expect(api.addCollectionIllustration).not.toHaveBeenCalled();
    expect(api.removeCollectionIllustration).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sauvegarder' }));

    await waitFor(() => expect(api.addCollectionIllustration).toHaveBeenCalledWith('col-b', 'illus-1'));
    expect(api.removeCollectionIllustration).toHaveBeenCalledWith('col-a', 'illus-1');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const savedChips = vi.mocked(onSaved).mock.calls[0]![0] as CollectionChip[];
    expect(savedChips.map((c) => c.id)).toEqual(['col-b']);
    expect(onClose).toHaveBeenCalled();
  });

  it('"Annuler" discards all changes without calling the API', async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = setup();
    await screen.findByText('Carnet A');

    await user.click(screen.getByRole('checkbox', { name: 'Recueil B' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(api.addCollectionIllustration).not.toHaveBeenCalled();
    expect(api.removeCollectionIllustration).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('portals the dialog to document.body above the navbar (z-index >= 100)', async () => {
    const { container } = setup();
    const dialog = await screen.findByRole('dialog', { name: /Gérer les collections/i });
    // Escaped the render container (portal) and lives under document.body.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    const overlay = dialog.parentElement!;
    expect(Number(overlay.style.zIndex)).toBeGreaterThanOrEqual(100);
  });

  it('renders selectable collections as on-brand rows with cover thumbnails and counts', async () => {
    setup();
    const checkbox = await screen.findByRole('checkbox', { name: 'Recueil B' });
    const row = checkbox.closest('.ep-pick-row')!;
    // The row carries the gallery-style halftone cover thumbnail.
    expect(row.querySelector('.ep-pick-cover')).toBeTruthy();
    // ...and the illustration count.
    expect(row.textContent).toMatch(/1 illustration/);
  });

  it('the cover + title of an addable collection links to its /oeuvre/:slug page', async () => {
    setup();
    await screen.findByText('Carnet A');
    const link = screen.getByRole('link', { name: /Recueil B/ });
    expect(link).toHaveAttribute('href', '/oeuvre/recueil-b');
  });

  it('the cover + title of a member collection links to its /oeuvre/:slug page', async () => {
    setup();
    const link = await screen.findByRole('link', { name: /Carnet A/ });
    expect(link).toHaveAttribute('href', '/oeuvre/carnet-a');
  });

  it('the selection controls are NOT links — the checkbox and "Retirer" toggle without navigating', async () => {
    setup();
    const checkbox = await screen.findByRole('checkbox', { name: 'Recueil B' });
    expect(checkbox.closest('a')).toBeNull();
    const retirer = screen.getByRole('button', { name: /Retirer/ });
    expect(retirer.closest('a')).toBeNull();
    // The navigable link and the toggle control are separate elements in the same row.
    const row = checkbox.closest('.ep-pick-row')!;
    expect(row.querySelector('a[href="/oeuvre/recueil-b"]')).toBeTruthy();
  });

  it('creates a new collection and makes it available to add (persisted on Sauvegarder)', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Carnet A');

    await user.click(screen.getByRole('button', { name: /Nouvelle collection/ }));
    await user.click(screen.getByRole('button', { name: 'stub-create' })); // fires onCreated

    expect(await screen.findByText('Nouvelle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sauvegarder' }));

    await waitFor(() => expect(api.addCollectionIllustration).toHaveBeenCalledWith('col-new', 'illus-1'));
  });
});
