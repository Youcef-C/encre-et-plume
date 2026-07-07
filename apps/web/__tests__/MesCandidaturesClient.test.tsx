import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, MyApplicationRow, MyApplicationsResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyApplications: vi.fn(),
    withdrawApplication: vi.fn(),
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import MesCandidaturesClient from '../components/candidatures/MesCandidaturesClient';

const account: AccountSummary = {
  id: 'u1',
  displayName: 'Camille R.',
  email: 'c@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-roux',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const row = (over: Partial<MyApplicationRow> = {}): MyApplicationRow => ({
  id: 'app-1',
  callId: 'call-1',
  callTitle: '« Lames de Brume »',
  callDirection: 'writerSeeksIllustrator',
  callGenres: ['seinen'],
  callSampleUrl: null,
  ownerName: 'Camille R.',
  status: 'pending',
  appliedAs: null,
  createdAt: '2026-06-18T10:00:00.000Z',
  ...over,
});

const response = (items: MyApplicationRow[], over: Partial<MyApplicationsResponse> = {}): MyApplicationsResponse => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalAll: items.length,
  ...over,
});

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <MesCandidaturesClient />
    </SessionContext.Provider>,
  );
}

const getList = () => api.getMyApplications as ReturnType<typeof vi.fn>;
const getWithdraw = () => api.withdrawApplication as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('MesCandidaturesClient (MC-6)', () => {
  it('shows skeletons while loading, then the rows with full row content', async () => {
    let resolve!: (r: MyApplicationsResponse) => void;
    getList().mockReturnValue(new Promise<MyApplicationsResponse>((r) => (resolve = r)));
    renderClient();
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    resolve(response([row()]));

    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
    expect(screen.getByText(/Scénariste cherche dessinateur·rice/)).toBeInTheDocument();
    expect(screen.getByText(/Seinen/)).toBeInTheDocument();
    expect(screen.getByText(/Camille R\./)).toBeInTheDocument();
    expect(screen.getByText(/Candidaté le 18 juin/)).toBeInTheDocument();
    // Status badge (distinct from the "En attente" filter chip by its glyph).
    expect(screen.getByText('● En attente')).toBeInTheDocument();
  });

  it('renders each status as readable text, including the muted rejected row', async () => {
    getList().mockResolvedValue(
      response([
        row({ id: 'a', callId: 'c-a', callTitle: '« Accepté »', status: 'accepted' }),
        row({ id: 'r', callId: 'c-r', callTitle: '« Refusé »', status: 'rejected' }),
      ]),
    );
    renderClient();
    expect(await screen.findByText('✓ Acceptée')).toBeInTheDocument();
    expect(screen.getByText('✕ Refusée')).toBeInTheDocument();
    // rejected title still readable
    expect(screen.getByText('« Refusé »')).toBeInTheDocument();
  });

  it('renders the applied-as role when set, and omits it when null', async () => {
    getList().mockResolvedValue(
      response([
        row({ id: 'as', callId: 'c-as', callTitle: '« Avec rôle »', appliedAs: 'dessinateur' }),
        row({ id: 'no', callId: 'c-no', callTitle: '« Sans rôle »', appliedAs: null }),
      ]),
    );
    renderClient();
    expect(await screen.findByText(/En tant que dessinateur·rice/)).toBeInTheDocument();
    // Only one row carries the applied-as line.
    expect(screen.getAllByText(/En tant que/)).toHaveLength(1);
  });

  it('links each row to its call with an accessible name containing the title', async () => {
    getList().mockResolvedValue(response([row({ callId: 'deep-9' })]));
    renderClient();
    const link = await screen.findByRole('link', { name: /Lames de Brume/ });
    expect(link).toHaveAttribute('href', '/appels?call=deep-9');
  });

  it('shows the "Toutes · N" count and refetches with status=pending when a chip is clicked', async () => {
    getList().mockResolvedValue(response([row()], { totalAll: 3 }));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Lames de Brume »');
    expect(screen.getByRole('button', { name: /Toutes · 3/ })).toBeInTheDocument();

    const chip = screen.getByRole('button', { name: 'En attente' });
    await user.click(chip);
    await waitFor(() => {
      const last = getList().mock.calls.at(-1)![0];
      expect(last).toMatchObject({ status: 'pending', page: 1 });
    });
    expect(screen.getByRole('button', { name: 'En attente' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the empty state with a link to the calls board', async () => {
    getList().mockResolvedValue(response([]));
    renderClient();
    expect(await screen.findByText('Vous n’avez pas encore candidaté.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Appels à projets' });
    expect(link).toHaveAttribute('href', '/appels');
  });

  it('renders an error state and retries', async () => {
    getList().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(response([row()]));
    const user = userEvent.setup();
    renderClient();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger vos candidatures.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
  });

  it('gates logged-out visitors with a "Se connecter" link', async () => {
    renderClient(null);
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('withdraws a pending application via inline confirm and removes the row', async () => {
    getList().mockResolvedValue(
      response([
        row({ id: 'p1', callTitle: '« En attente »', status: 'pending' }),
        row({ id: 'a1', callId: 'c-a', callTitle: '« Acceptée »', status: 'accepted' }),
      ], { totalAll: 2 }),
    );
    getWithdraw().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« En attente »');

    // Only the pending row offers "Retirer".
    const retirer = screen.getByRole('button', { name: /Retirer/ });
    await user.click(retirer);

    // Inline confirm appears (no browser confirm()).
    const confirm = await screen.findByRole('button', { name: 'Confirmer le retrait' });
    await user.click(confirm);

    await waitFor(() => expect(api.withdrawApplication).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('« En attente »')).not.toBeInTheDocument());
    // Count drops to 1.
    expect(screen.getByRole('button', { name: /Toutes · 1/ })).toBeInTheDocument();
    // Accepted row stays.
    expect(screen.getByText('« Acceptée »')).toBeInTheDocument();
  });
});
