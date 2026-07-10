// CS-1 — "Nouveau projet" wizard (manga/histoire). Type radiogroup (Manga pre-selected), the
// Illustration card routes to /creer/illustration, step navigation, required-title validation, F-20
// genre/theme pickers, invite search → member chip + split row, "Je recherche" counters, the step-3
// Soutien fields + revenue split (must total 100 %), "Configurer plus tard", and the submit mapping.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveGenreId, type AccountSummary, type CreateProjectRequest, type PartnersResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createProject: vi.fn(),
    getPartners: vi.fn(),
    getActiveContest: vi.fn(),
  };
});

vi.mock('../components/UploadControl', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

import * as api from '../lib/api';
import NewProjectWizard from '../components/creer/NewProjectWizard';

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

const partners: PartnersResponse = {
  items: [
    {
      userId: 'u2',
      slug: 'ines-khelifi',
      name: 'Inès Khelifi',
      avatarUrl: null,
      role: 'dessinateur',
      location: null,
      styleTags: [],
      genreTags: ['Josei'],
      portfolioThumbs: [],
      availability: 'disponible',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

function renderWizard() {
  return render(
    <SessionContext.Provider value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <NewProjectWizard />
    </SessionContext.Provider>,
  );
}

const createMock = () => api.createProject as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  (api.getActiveContest as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (api.getPartners as ReturnType<typeof vi.fn>).mockResolvedValue(partners);
  createMock().mockResolvedValue({ id: 'p9', slug: 'nuit-blanche', workId: 'w9', title: 'Nuit Blanche' });
});

describe('NewProjectWizard (CS-1)', () => {
  it('renders the type radiogroup with Manga pre-selected', () => {
    renderWizard();
    const group = screen.getByRole('radiogroup', { name: /type de projet/i });
    expect(within(group).getByRole('radio', { name: /Manga/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: /Histoire/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('lets CSS drive the type-card grid columns (no hard-coded inline grid → responsive single-column at ≤560px)', () => {
    renderWizard();
    const group = screen.getByRole('radiogroup', { name: /type de projet/i });
    // The columns must come from the .ep-type-cards CSS rule (which collapses to 1fr at ≤560px), not an
    // inline style that would out-specify the media query and keep 3 cramped columns on mobile.
    expect(group).toHaveClass('ep-type-cards');
    expect(group.getAttribute('style') ?? '').not.toMatch(/grid-template-columns/);
  });

  it('routes the Illustration(s) card to the existing illustration wizard', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: /Illustration/ }));
    expect(push).toHaveBeenCalledWith('/creer/illustration');
  });

  it('blocks Continuer/create with an inline error on an empty title, no API call', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ })); // step 1 → 2
    await user.click(screen.getByRole('button', { name: /Continuer/ })); // step 2 with empty title
    expect(await screen.findByText('Un titre est requis')).toBeInTheDocument();
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('adds a genre (single-select) and a theme (multi) via the F-20 picker', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    await user.type(screen.getByLabelText('Ajouter un genre'), 'Seinen');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Retirer Seinen' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ajouter un thème'), 'Action');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Retirer Action' })).toBeInTheDocument();
  });

  it('increments and decrements a "Je recherche" counter with a floor of 0', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    const inc = screen.getByRole('button', { name: /Plus de scénaristes/ });
    const dec = screen.getByRole('button', { name: /Moins de scénaristes/ });
    const value = screen.getByTestId('seeking-scenariste');
    expect(value).toHaveTextContent('0');
    await user.click(inc);
    expect(value).toHaveTextContent('1');
    await user.click(dec);
    await user.click(dec); // floor at 0
    expect(value).toHaveTextContent('0');
  });

  it('adds an invited member from the search which appears as a removable chip and a split row', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    await user.type(screen.getByLabelText(/Inviter par nom/), 'Inès');
    await waitFor(() => expect(api.getPartners).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Ajouter Inès Khelifi' }));

    expect(await screen.findByRole('button', { name: 'Retirer Inès Khelifi' })).toBeInTheDocument();
    // Go to step 3 — Inès now has a revenue-split row.
    await user.type(screen.getByLabelText('Titre du projet'), 'Nuit Blanche');
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    const split = screen.getByRole('group', { name: /Partage des revenus/ });
    expect(within(split).getByText('Inès Khelifi')).toBeInTheDocument();
  });

  it('disables "Créer le projet" when the revenue split does not total 100 %, enables it at 100 %', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.type(screen.getByLabelText('Titre du projet'), 'Nuit Blanche');

    // Add a second member so the split is user-controlled.
    await user.type(screen.getByLabelText(/Inviter par nom/), 'Inès');
    await user.click(await screen.findByRole('button', { name: 'Ajouter Inès Khelifi' }));
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    const create = screen.getByRole('button', { name: 'Créer le projet' });
    const split = screen.getByRole('group', { name: /Partage des revenus/ });
    // Push one member's share up so the total exceeds 100 %.
    await user.click(within(split).getAllByRole('button', { name: /Augmenter la part/ })[0]);
    await waitFor(() => expect(create).toBeDisabled());
    // Bring it back to 100 %.
    await user.click(within(split).getAllByRole('button', { name: /Diminuer la part/ })[0]);
    await waitFor(() => expect(create).toBeEnabled());
  });

  it('submits the mapped CreateProjectRequest and routes to /projets on success', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.type(screen.getByLabelText('Titre du projet'), 'Nuit Blanche');
    await user.type(screen.getByLabelText('Ajouter un genre'), 'Seinen');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: /Continuer/ })); // → step 3

    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    const body = createMock().mock.calls[0][0] as CreateProjectRequest;
    expect(body.type).toBe('manga');
    expect(body.title).toBe('Nuit Blanche');
    expect(body.genre).toBe(resolveGenreId('Seinen'));
    expect(push).toHaveBeenCalledWith('/projets');
  });

  it('"Configurer plus tard" submits from step 2 with the current values', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.type(screen.getByLabelText('Titre du projet'), 'Brouillon');
    await user.click(screen.getByRole('button', { name: /Configurer plus tard/ }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    const body = createMock().mock.calls[0][0] as CreateProjectRequest;
    expect(body.title).toBe('Brouillon');
    expect(body.tiers).toBeUndefined();
  });

  it('keeps the wizard open with values preserved when the create request fails', async () => {
    createMock().mockRejectedValue({ message: 'Erreur serveur' });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.type(screen.getByLabelText('Titre du projet'), 'Nuit Blanche');
    await user.click(screen.getByRole('button', { name: /Configurer plus tard/ }));
    expect(await screen.findByText('Erreur serveur')).toBeInTheDocument();
    expect(screen.getByLabelText('Titre du projet')).toHaveValue('Nuit Blanche');
  });
});
