import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CallCard } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, createCall: vi.fn() };
});

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
    expect(await screen.findByText(/Choisissez qui vous cherchez/)).toBeInTheDocument();
    expect(screen.getByText(/Le titre est requis/)).toBeInTheDocument();
    expect(screen.getByText(/La description est requise/)).toBeInTheDocument();
    expect(screen.getByText(/La date de clôture est requise/)).toBeInTheDocument();
    expect(api.createCall).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('rejects a past deadline', async () => {
    const user = userEvent.setup();
    render(<PostCallModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Un·e scénariste' }));
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

    await user.click(screen.getByRole('button', { name: 'Un·e scénariste' }));
    await user.type(screen.getByLabelText('Titre'), 'Mon appel');
    await user.type(screen.getByLabelText('Description'), 'Une histoire.');
    const genre = screen.getByRole('combobox', { name: 'Ajouter un genre' });
    await user.type(genre, 'Seinen{Enter}');
    await user.type(screen.getByLabelText('Date de clôture'), futureDate(10));
    await user.click(screen.getByRole('button', { name: "Publier l'appel" }));

    await waitFor(() => expect(api.createCall).toHaveBeenCalledTimes(1));
    const payload = (api.createCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toMatchObject({
      direction: 'illustratorSeeksWriter',
      title: 'Mon appel',
      description: 'Une histoire.',
      genres: ['seinen'],
    });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onClose).toHaveBeenCalled();
  });
});
