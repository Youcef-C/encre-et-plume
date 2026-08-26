import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CallCard, CallDetail, CallsBoardResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getCallsBoard: vi.fn(),
    getCallDetail: vi.fn(),
    createCall: vi.fn(),
    applyToCall: vi.fn(),
    withdrawApplication: vi.fn(),
    getMe: vi.fn(),
    getProfile: vi.fn(),
    getProfilePortfolio: vi.fn(),
    getMyProjects: vi.fn(() => Promise.resolve({ items: [] })),
  };
});

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import AppelsClient from '../components/appels/AppelsClient';

const account: AccountSummary = {
  id: 'u1',
  displayName: 'Camille R.',
  email: 'c@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-roux',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const call = (over: Partial<CallCard> = {}): CallCard => ({
  id: 'call-1',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: '« Lames de Brume »',
  tags: ['Seinen'],
  authorName: 'Camille R.',
  authorAvatar: null,
  closesInDays: 12,
  applicationCount: 0,
  direction: 'writerSeeksIllustrator',
  description: 'Un thriller urbain.',
  sampleUrl: null,
  status: 'open',
  deadline: '2026-07-19T00:00:00.000Z',
  isOwner: false,
  hasApplied: false,
  myApplicationId: null,
  myApplicationStatus: null,
  viewerHasRole: true,
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
  ...over,
});

const detail = (over: Partial<CallDetail> = {}): CallDetail => ({
  ...call(),
  createdAt: '2026-07-01T00:00:00.000Z',
  samples: [],
  documents: [],
  team: [],
  genres: ['seinen'],
  format: null,
  scope: null,
  ...over,
});

const board = (items: CallCard[], total = items.length): CallsBoardResponse => ({
  items,
  page: 1,
  pageSize: 10,
  total,
});

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <AppelsClient />
    </SessionContext.Provider>,
  );
}

const getBoard = () => api.getCallsBoard as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  (api.getCallDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail());
});

describe('AppelsClient (MC-4 board)', () => {
  it('shows skeletons while loading, then the cards', async () => {
    let resolve!: (r: CallsBoardResponse) => void;
    getBoard().mockReturnValue(new Promise<CallsBoardResponse>((r) => (resolve = r)));
    renderClient();
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    resolve(board([call()]));
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
  });

  it('shows the empty message verbatim when no call matches', async () => {
    getBoard().mockResolvedValue(board([]));
    renderClient();
    expect(await screen.findByText('Aucun appel pour ces filtres.')).toBeInTheDocument();
  });

  // DR-14: the red block is the TERMINAL path only; a transient failure keeps the skeleton.
  it('renders an error state and retries on a terminal failure', async () => {
    getBoard()
      .mockRejectedValueOnce({ statusCode: 403, message: 'Interdit', error: 'FORBIDDEN' })
      .mockResolvedValueOnce(board([call()]));
    const user = userEvent.setup();
    renderClient();
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
  });

  // DR-14 F1 — a 5xx keeps the skeleton and retries; no red block.
  it('keeps the skeleton and retries on a transient failure', async () => {
    getBoard()
      .mockRejectedValueOnce({ statusCode: 500, message: 'Erreur', error: 'INTERNAL' })
      .mockResolvedValue(board([call()]));
    renderClient();
    await waitFor(() => expect(api.getCallsBoard).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
  });

  it('refetches with the role filter when a role chip is toggled', async () => {
    getBoard().mockResolvedValue(board([call()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Lames de Brume »');
    await user.click(screen.getByRole('button', { name: 'Dessinateur·rice' }));
    await waitFor(() => {
      const last = getBoard().mock.calls.at(-1)![0];
      expect(last).toMatchObject({ role: 'dessinateur', status: 'all', page: 1 });
    });
  });

  it('prepends the new card after a successful post', async () => {
    getBoard().mockResolvedValue(board([call({ id: 'existing', title: '« Existant »' })]));
    (api.createCall as ReturnType<typeof vi.fn>).mockResolvedValue(
      call({ id: 'fresh', title: '« Tout neuf »' }),
    );
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Existant »');

    await user.click(screen.getByRole('button', { name: '＋ Poster un appel' }));
    const dialog = screen.getByRole('dialog', { name: 'Poster un appel' });
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter un poste Dessinateur·rice' }));
    await user.type(within(dialog).getByLabelText('Titre'), 'Tout neuf');
    await user.type(within(dialog).getByLabelText('Description'), 'Une histoire.');
    await user.type(within(dialog).getByRole('combobox', { name: 'Ajouter un genre' }), 'Seinen{Enter}');
    const d = new Date();
    d.setDate(d.getDate() + 10);
    await user.type(within(dialog).getByLabelText('Date de clôture'), d.toISOString().slice(0, 10));
    await user.click(within(dialog).getByRole('button', { name: "Publier l'appel" }));

    await waitFor(() => expect(api.createCall).toHaveBeenCalled());
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles[0]).toBe('« Tout neuf »');
  });

  it('opens the apply modal and flips the card to "Candidature envoyée" with an incremented count', async () => {
    getBoard().mockResolvedValue(
      board([call({ id: 'c9', title: '« One-shot »', closesInDays: null, deadline: null, applicationCount: 5 })]),
    );
    (api.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'yuki-moreau' });
    (api.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ creatorRoles: ['dessinateur'] });
    (api.getProfilePortfolio as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'pf-1', image: 'https://cdn/1.jpg', caption: 'Encre', order: 0 },
    ]);
    (api.applyToCall as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'app-1', callId: 'c9' });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('button', { name: 'Candidater' }));
    const dialog = screen.getByRole('dialog', { name: 'Candidater' });
    await user.click(await within(dialog).findByRole('button', { name: /Encre/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer ma candidature' }));

    await waitFor(() => expect(api.applyToCall).toHaveBeenCalledWith('c9', { samples: [{ portfolioItemId: 'pf-1' }] }));
    // Confirmation shown; close the modal (Escape avoids the header X / footer "Fermer" name clash).
    await within(dialog).findByText('Candidature envoyée !');
    await user.keyboard('{Escape}');

    expect(await screen.findByText('Candidature envoyée')).toBeInTheDocument();
    expect(screen.getByText('6 candidatures')).toBeInTheDocument();
  });

  it('renders "Mes candidatures" as a link to /mes-candidatures', async () => {
    getBoard().mockResolvedValue(board([call()]));
    renderClient();
    await screen.findByText('« Lames de Brume »');
    const link = screen.getByRole('link', { name: 'Mes candidatures' });
    expect(link).toHaveAttribute('href', '/mes-candidatures');
  });

  it('highlights the deep-linked card when ?call= is present', async () => {
    searchParams = new URLSearchParams('call=deep-1');
    getBoard().mockResolvedValue(board([call({ id: 'deep-1', title: '« Cible »' })]));
    renderClient();
    await screen.findByText('« Cible »');
    await waitFor(() => {
      const el = document.getElementById('call-deep-1');
      expect(el?.style.outline).toContain('var(--accent)');
    });
  });

  it('opens the detail modal from "Voir le détail" and shows the fetched detail', async () => {
    getBoard().mockResolvedValue(board([call({ id: 'c9', title: '« Cible »' })]));
    (api.getCallDetail as ReturnType<typeof vi.fn>).mockResolvedValue(
      detail({ id: 'c9', title: '« Cible »', description: 'Description complète du projet.' }),
    );
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Cible »');

    await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
    await waitFor(() => expect(api.getCallDetail).toHaveBeenCalledWith('c9'));
    expect(await screen.findByText('Description complète du projet.')).toBeInTheDocument();
  });

  it('opens the detail modal too when ?call= deep-links a call', async () => {
    searchParams = new URLSearchParams('call=deep-1');
    getBoard().mockResolvedValue(board([call({ id: 'deep-1', title: '« Cible »' })]));
    (api.getCallDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail({ id: 'deep-1', title: '« Cible »' }));
    renderClient();
    await waitFor(() => expect(api.getCallDetail).toHaveBeenCalledWith('deep-1'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('withdraws from the board and flips the card back to "Candidater"', async () => {
    getBoard().mockResolvedValue(
      board([call({ id: 'c9', hasApplied: true, myApplicationId: 'app-9', applicationCount: 3, closesInDays: null, deadline: null })]),
    );
    (api.withdrawApplication as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Candidature envoyée');

    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));

    await waitFor(() => expect(api.withdrawApplication).toHaveBeenCalledWith('app-9'));
    expect(await screen.findByRole('button', { name: 'Candidater' })).toBeInTheDocument();
    expect(screen.getByText('2 candidatures')).toBeInTheDocument();
  });
});
