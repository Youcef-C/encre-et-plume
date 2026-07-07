import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, PartnerCard as PartnerCardData, PartnersResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getPartners: vi.fn(),
    getCalls: vi.fn().mockResolvedValue({ items: [] }),
    getProfile: vi.fn().mockResolvedValue({ creatorRoles: [] }),
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
import TrouverClient from '../components/trouver/TrouverClient';

const account: AccountSummary = {
  id: 'u1',
  displayName: 'Camille R.',
  email: 'camille@example.com',
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

function partner(overrides: Partial<PartnerCardData> = {}): PartnerCardData {
  return {
    userId: 'acc-theo',
    slug: 'mc1-theo-m',
    name: 'Théo M.',
    avatarUrl: null,
    role: 'dessinateur',
    location: 'Auvergne-Rhône-Alpes',
    styleTags: ['Encre dense'],
    genreTags: ['Seinen'],
    portfolioThumbs: [],
    availability: 'disponible',
    ...overrides,
  };
}

function ok(items: PartnerCardData[], total = items.length): PartnersResponse {
  return { items, page: 1, pageSize: 12, total };
}

function renderClient(sessionOverrides: Partial<React.ContextType<typeof SessionContext>> = {}) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn(), ...sessionOverrides }}
    >
      <TrouverClient />
    </SessionContext.Provider>,
  );
}

const lastQuery = () => {
  const calls = (api.getPartners as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as URLSearchParams;
};

beforeEach(() => {
  vi.clearAllMocks();
  (api.getCalls as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  (api.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({ creatorRoles: [] });
});

describe('TrouverClient', () => {
  it('renders the header title and subtitle verbatim', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    expect(await screen.findByRole('heading', { name: 'Trouver un·e partenaire' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Scénaristes & dessinateur·rices — parcourez les portfolios ou laissez l'algorithme suggérer.",
      ),
    ).toBeInTheDocument();
  });

  it('sends no viewerRole and no region param (round-2 contract)', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await waitFor(() => expect(api.getPartners).toHaveBeenCalled());
    expect(lastQuery().get('viewerRole')).toBeNull();
    expect(lastQuery().get('region')).toBeNull();
    expect(lastQuery().get('role')).toBeNull();
  });

  it('shows a "Je cherche :" partner-role label', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    expect(await screen.findByText('Je cherche :')).toBeInTheDocument();
  });

  it('renders partners as list items inside a list', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    expect(await screen.findByText('Théo M.')).toBeInTheDocument();
    const item = screen.getByText('Théo M.').closest('li');
    expect(item).not.toBeNull();
    expect(item!.closest('ul')).not.toBeNull();
  });

  it('refetches with role=dessinateur when the "Je cherche" chip is toggled', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByText('Théo M.');
    const filters = screen.getByRole('group', { name: 'Je cherche :' });
    await userEvent.click(within(filters).getByRole('button', { name: 'Dessinateur·rice' }));
    await waitFor(() => expect(lastQuery().get('role')).toBe('dessinateur'));
  });

  it('refetches with repeated genres params from the Genres multi-select', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByText('Théo M.');
    await userEvent.click(screen.getByRole('button', { name: /Genres/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Josei' }));
    await waitFor(() => expect(lastQuery().getAll('genres')).toEqual(['josei']));
  });

  it('refetches with repeated locations params from the Localisation multi-select', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByText('Théo M.');
    await userEvent.click(screen.getByRole('button', { name: /Localisation/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Japon' }));
    await waitFor(() => expect(lastQuery().getAll('locations')).toEqual(['JP']));
  });

  it('clears the "Je cherche" role when the active chip is clicked again', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByText('Théo M.');
    const filters = screen.getByRole('group', { name: 'Je cherche :' });
    const chip = within(filters).getByRole('button', { name: 'Scénariste' });
    await userEvent.click(chip);
    await waitFor(() => expect(lastQuery().get('role')).toBe('scenariste'));
    await userEvent.click(chip);
    await waitFor(() => expect(lastQuery().get('role')).toBeNull());
  });

  it('shows the empty-state copy when no partner matches', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));
    renderClient();
    expect(
      await screen.findByText('Aucun·e partenaire ne correspond à ces filtres.'),
    ).toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Théo M.')).toBeInTheDocument();
  });

  it('appends the next page when "Charger plus" is clicked', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(ok([partner({ userId: 'a', name: 'Théo M.' })], 2))
      .mockResolvedValueOnce({
        items: [partner({ userId: 'b', name: 'Inès K.' })],
        page: 2,
        pageSize: 12,
        total: 2,
      });
    renderClient();
    await screen.findByText('Théo M.');
    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
    expect(await screen.findByText('Inès K.')).toBeInTheDocument();
    expect(screen.getByText('Théo M.')).toBeInTheDocument();
  });

  it('renders the "Appels à projets" band above the partner grid (owner §7)', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    (api.getCalls as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        {
          id: 'call-1',
          heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
          title: '« Lames de Brume »',
          tags: ['Seinen'],
          authorName: 'Camille R.',
          closesInDays: 12,
          applicationCount: 0,
        },
      ],
    });
    renderClient();
    const heading = await screen.findByRole('heading', { name: 'Appels à projets' });
    const card = await screen.findByText('Théo M.');
    // heading precedes the partner card in document order → band is above the grid
    expect(heading.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // §10: a distinct "Partenaires" section heading separates the two zones, above the grid
    const partenaires = screen.getByRole('heading', { name: 'Partenaires' });
    expect(partenaires.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no "Je suis :" self-role section (removed per owner request)', async () => {
    (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(ok([partner()]));
    renderClient();
    await screen.findByText('Théo M.');
    expect(screen.queryByText('Je suis :')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Je suis :' })).not.toBeInTheDocument();
  });

  it('shows the connect prompt instead of the grid when logged out', () => {
    renderClient({ account: null });
    expect(screen.getByText(/Connectez-vous pour parcourir/)).toBeInTheDocument();
    expect(api.getPartners).not.toHaveBeenCalled();
  });
});
