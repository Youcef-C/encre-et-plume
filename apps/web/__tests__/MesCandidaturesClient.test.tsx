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
    getMyApplication: vi.fn(),
    updateMyApplication: vi.fn(),
  };
});

// MC-6 amendment: the edit modal reuses ApplyCallModal — stub it (its own suite covers edit-mode wiring).
// The stub echoes the wired-through pre-fill (message + sample count) so we can assert MesCandidatures
// passes the fetched detail into the modal.
vi.mock('../components/appels/ApplyCallModal', () => ({
  default: ({
    edit,
    onClose,
    onApplied,
  }: {
    edit?: { applicationId: string; initialMessage: string; initialSamples: unknown[] };
    onClose: () => void;
    onApplied: (c: string, a: string) => void;
  }) => (
    <div role="dialog" aria-label="Modifier ma candidature">
      <p>msg:{edit?.initialMessage}</p>
      <p>samples:{edit?.initialSamples?.length ?? 0}</p>
      <button type="button" onClick={() => onApplied('call-1', edit?.applicationId ?? 'x')}>
        stub-save
      </button>
      <button type="button" onClick={onClose}>
        stub-close
      </button>
    </div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// MC-9 seam: accepted rows with an ownerId get a « Message » CTA wired to useMessaging().openDm().
const openDm = vi.fn();
vi.mock('../lib/messaging', () => ({
  useMessaging: () => ({ openDm }),
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
  preferences: { theme: 'system', dmPolicy: 'requests' },
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
  samples: [],
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
const getDetail = () => api.getMyApplication as ReturnType<typeof vi.fn>;

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
    expect(await screen.findByText('Acceptée')).toBeInTheDocument();
    expect(screen.getByText('Refusée')).toBeInTheDocument();
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

    // Both pending and accepted rows now offer "Retirer" (MC-6 amendment) — scope to the pending row.
    const pendingRow = screen.getByText('« En attente »').closest('li') as HTMLElement;
    await user.click(within(pendingRow).getByRole('button', { name: /Retirer/ }));

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

  it('MC-9 seam: an accepted row with an ownerId shows a "Message" CTA that opens a DM with the call author', async () => {
    getList().mockResolvedValue(
      response([row({ id: 'a1', callTitle: '« Acceptée »', status: 'accepted', ownerId: 'owner-1', ownerName: 'Théo M.' })]),
    );
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Acceptée »');

    const messageBtn = screen.getByRole('button', { name: 'Message à Théo M.' });
    await user.click(messageBtn);
    expect(openDm).toHaveBeenCalledWith('owner-1');
    // MC-6 amendment: accepted rows now ALSO offer "Retirer" (withdraw-when-accepted), alongside Message.
    expect(screen.getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
  });

  // MC-6 amendment: an accepted application can be withdrawn (frees the seat); rejected cannot.
  it('offers "Retirer" on an accepted application and withdraws it via inline confirm', async () => {
    getList().mockResolvedValue(
      response([row({ id: 'a1', callTitle: '« Acceptée »', status: 'accepted', ownerId: 'o1', ownerName: 'Théo M.' })], { totalAll: 1 }),
    );
    getWithdraw().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Acceptée »');

    await user.click(screen.getByRole('button', { name: /^Retirer$/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer le retrait' }));

    await waitFor(() => expect(api.withdrawApplication).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByText('« Acceptée »')).not.toBeInTheDocument());
  });

  it('hides "Retirer" on a rejected application', async () => {
    getList().mockResolvedValue(response([row({ id: 'r1', callTitle: '« Refusée »', status: 'rejected' })]));
    renderClient();
    await screen.findByText('« Refusée »');
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });

  // ─── MC-6 amendment: view + edit a pending application ─────────────────────────
  it('a pending row offers "Voir" and "Modifier"; "Voir" opens the detail with the message + samples', async () => {
    getList().mockResolvedValue(response([row({ id: 'p1', callTitle: '« En attente »', status: 'pending' })]));
    getDetail().mockResolvedValue(
      row({
        id: 'p1',
        callTitle: '« En attente »',
        status: 'pending',
        message: 'Mon message détaillé.',
        samples: [{ url: 'https://cdn/s.jpg', kind: 'image', size: null }],
      }),
    );
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« En attente »');

    const rowEl = screen.getByText('« En attente »').closest('li') as HTMLElement;
    expect(within(rowEl).getByRole('button', { name: /^Modifier/ })).toBeInTheDocument();
    await user.click(within(rowEl).getByRole('button', { name: 'Voir' }));

    await waitFor(() => expect(api.getMyApplication).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Mon message détaillé.')).toBeInTheDocument();
  });

  it('a pending row opens the edit modal via "Modifier", passing the fetched message + existing samples, and refreshes on save', async () => {
    getList().mockResolvedValue(response([row({ id: 'p1', callTitle: '« En attente »', status: 'pending' })]));
    getDetail().mockResolvedValue(
      row({
        id: 'p1',
        callTitle: '« En attente »',
        status: 'pending',
        message: 'Texte initial',
        samples: [
          { url: 'https://cdn/pf.jpg', kind: 'image', size: null, portfolioItemId: 'pf-1' },
          { url: 'https://cdn/up.jpg', kind: 'image', size: null, mediaId: 'media-x' },
        ],
      }),
    );
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« En attente »');

    await user.click(screen.getByRole('button', { name: /^Modifier/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier ma candidature' });
    await waitFor(() => expect(api.getMyApplication).toHaveBeenCalledWith('p1'));
    // The fetched detail (message + 2 existing samples) is wired into the modal.
    expect(within(dialog).getByText('msg:Texte initial')).toBeInTheDocument();
    expect(within(dialog).getByText('samples:2')).toBeInTheDocument();
    // Saving via the reused modal triggers a list refresh.
    await user.click(within(dialog).getByRole('button', { name: 'stub-save' }));
    await waitFor(() => expect(getList().mock.calls.length).toBeGreaterThan(1));
  });

  it('an accepted row offers "Voir" but not "Modifier" (view-only)', async () => {
    getList().mockResolvedValue(response([row({ id: 'a1', callTitle: '« Acceptée »', status: 'accepted' })]));
    getDetail().mockResolvedValue(row({ id: 'a1', callTitle: '« Acceptée »', status: 'accepted', message: 'Vu.' }));
    renderClient();
    await screen.findByText('« Acceptée »');

    const rowEl = screen.getByText('« Acceptée »').closest('li') as HTMLElement;
    expect(within(rowEl).getByRole('button', { name: 'Voir' })).toBeInTheDocument();
    expect(within(rowEl).queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
  });

  it('MC-9 seam: an accepted row WITHOUT an ownerId (pre-MC-9 / seed calls) shows no "Message" CTA', async () => {
    getList().mockResolvedValue(
      response([row({ id: 'a2', callTitle: '« Acceptée sans owner »', status: 'accepted', ownerId: null })]),
    );
    renderClient();
    await screen.findByText('« Acceptée sans owner »');
    expect(screen.queryByRole('button', { name: /^Message/ })).not.toBeInTheDocument();
    expect(openDm).not.toHaveBeenCalled();
  });
});
