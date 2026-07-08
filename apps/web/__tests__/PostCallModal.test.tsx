import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CallCard, MediaResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, createCall: vi.fn(), getMyProjects: vi.fn(() => Promise.resolve({ items: [] })) };
});

// §8: request one seat for a role via its stepper "＋" button.
async function seekOne(user: ReturnType<typeof userEvent.setup>, roleLabel: string) {
  await user.click(screen.getByRole('button', { name: `Ajouter un poste ${roleLabel}` }));
}

// Mock the single combined UploadControl — exposes "upload image" and "upload doc" buttons, each firing
// onUploaded with a MediaResponse carrying the routed `kind` (the parent reads media.kind to place it).
// A module counter keeps every uploaded id unique across rapid clicks.
let uploadSeq = 0;
vi.mock('../components/UploadControl', () => ({
  default: ({ onUploaded }: { onUploaded: (m: MediaResponse, filename?: string) => void }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onUploaded({ id: `media-img-${++uploadSeq}`, kind: 'call_sample', variants: { thumb: 'https://cdn/thumb.jpg' } } as unknown as MediaResponse)
        }
      >
        upload image
      </button>
      <button
        type="button"
        onClick={() => onUploaded({ id: `media-doc-${++uploadSeq}`, kind: 'call_document', variants: {} } as MediaResponse, 'scenario.pdf')}
      >
        upload doc
      </button>
    </>
  ),
}));

import * as api from '../lib/api';
import PostCallModal from '../components/appels/PostCallModal';

const created: CallCard = {
  id: 'call-new',
  heading: 'DESSINATEUR CHERCHE SCÉNARISTE',
  title: 'Mon appel',
  tags: ['Seinen'],
  authorName: 'Moi',
  closesInDays: 10,
  applicationCount: 0,
  direction: 'illustratorSeeksWriter',
  description: 'Une histoire.',
  sampleUrl: null,
  status: 'open',
  deadline: '2026-08-01T00:00:00.000Z',
  isOwner: true,
  hasApplied: false,
  myApplicationId: null,
  viewerHasRole: false,
  seekingRoles: ['scenariste'],
  seats: { scenariste: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
};

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => vi.clearAllMocks());

describe('PostCallModal', () => {
  it('renders a labelled dialog', () => {
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Poster un appel' });
    expect(dialog).toBeInTheDocument();
  });

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<PostCallModal onClose={vi.fn()} onCreated={onCreated} />);
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));
    expect(await screen.findByText(/Choisissez au moins un poste recherché/)).toBeInTheDocument();
    expect(screen.getByText(/Le titre est requis/)).toBeInTheDocument();
    expect(screen.getByText(/La description est requise/)).toBeInTheDocument();
    expect(screen.getByText(/La date de clôture est requise/)).toBeInTheDocument();
    expect(api.createCall).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('rejects a past deadline', async () => {
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await seekOne(user, 'Scénariste');
    await user.type(screen.getByLabelText('Titre'), 'Mon appel');
    await user.type(screen.getByLabelText('Description'), 'Une histoire.');
    const genre = screen.getByRole('combobox', { name: 'Ajouter un genre' });
    await user.type(genre, 'Seinen{Enter}');
    const date = screen.getByLabelText('Date de clôture');
    await user.type(date, futureDate(-2));
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));
    expect(await screen.findByText(/doit être dans le futur/)).toBeInTheDocument();
    expect(api.createCall).not.toHaveBeenCalled();
  });

  it('submits the mapped payload and calls onCreated', async () => {
    (api.createCall as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<PostCallModal onClose={onClose} onCreated={onCreated} />);

    await seekOne(user, 'Scénariste');
    await user.type(screen.getByLabelText('Titre'), 'Mon appel');
    await user.type(screen.getByLabelText('Description'), 'Une histoire.');
    const genre = screen.getByRole('combobox', { name: 'Ajouter un genre' });
    await user.type(genre, 'Seinen{Enter}');
    await user.type(screen.getByLabelText('Date de clôture'), futureDate(10));
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));

    await waitFor(() => expect(api.createCall).toHaveBeenCalledTimes(1));
    const payload = (api.createCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({
      seats: { scenariste: 1 },
      title: 'Mon appel',
      description: 'Une histoire.',
      genres: ['seinen'],
    });
    expect(payload.authorRole).toBeUndefined();
    expect(payload.seekingRoles).toBeUndefined();
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalled();
  });

  it('sends per-role seat counts from the steppers', async () => {
    (api.createCall as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Ajouter un poste Dessinateur·rice' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un poste Scénariste' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un poste Scénariste' }));
    // Overshoot then step back down to prove the − control + 0-floor.
    await user.click(screen.getByRole('button', { name: 'Retirer un poste Scénariste' }));

    await user.type(screen.getByLabelText('Titre'), 'Mon appel');
    await user.type(screen.getByLabelText('Description'), 'Une histoire.');
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un genre' }), 'Seinen{Enter}');
    await user.type(screen.getByLabelText('Date de clôture'), futureDate(10));
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));

    await waitFor(() => expect(api.createCall).toHaveBeenCalledTimes(1));
    expect((api.createCall as ReturnType<typeof vi.fn>).mock.calls[0][0].seats).toEqual({
      scenariste: 1,
      dessinateur: 1,
    });
  });

  // MC-4X multi-sample + PDF documents.
  it('appends and removes sample visuals, capping the count', async () => {
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'upload image' }));
    await user.click(screen.getByRole('button', { name: 'upload image' }));
    expect(screen.getAllByAltText(/Visuel d'exemple/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Retirer le visuel 1' }));
    expect(screen.getAllByAltText(/Visuel d'exemple/)).toHaveLength(1);
  });

  it('lists uploaded PDF documents with a remove control', async () => {
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'upload doc' }));
    expect(screen.getByText('✓ scenario.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer le document 1' }));
    expect(screen.queryByText('✓ scenario.pdf')).not.toBeInTheDocument();
  });

  it('submits sampleMediaIds and documentMediaIds in the body', async () => {
    (api.createCall as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await seekOne(user, 'Scénariste');
    await user.type(screen.getByLabelText('Titre'), 'Mon appel');
    await user.type(screen.getByLabelText('Description'), 'Une histoire.');
    await user.type(screen.getByRole('combobox', { name: 'Ajouter un genre' }), 'Seinen{Enter}');
    await user.type(screen.getByLabelText('Date de clôture'), futureDate(10));
    await user.click(screen.getByRole('button', { name: 'upload image' }));
    await user.click(screen.getByRole('button', { name: 'upload doc' }));
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));

    await waitFor(() => expect(api.createCall).toHaveBeenCalledTimes(1));
    const payload = (api.createCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.sampleMediaIds).toHaveLength(1);
    expect(payload.sampleMediaIds[0]).toMatch(/^media-img-/);
    expect(payload.documentMediaIds).toHaveLength(1);
    expect(payload.documentMediaIds[0]).toMatch(/^media-doc-/);
  });
});
