import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// Stable router reference
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, completeOnboarding: vi.fn() };
});

import * as api from '../lib/api';
import OnboardingClient from '../app/onboarding/OnboardingClient';

// Not-yet-onboarded account
const baseAccount: AccountSummary = {
  id: 'u1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: true,
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
  onboarded: false,
};

const onboardedAccount: AccountSummary = { ...baseAccount, onboarded: true };

const mockRefresh = vi.fn();

function renderWizard(account: AccountSummary | null = baseAccount, loading = false) {
  return render(
    <SessionContext.Provider
      value={{ account, loading, refresh: mockRefresh, logout: vi.fn() }}
    >
      <OnboardingClient />
    </SessionContext.Provider>,
  );
}

describe('OnboardingClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.completeOnboarding).mockResolvedValue(onboardedAccount);
    mockRefresh.mockResolvedValue(undefined);
  });

  // ── Guard redirects ──────────────────────────────────────────────────────────

  it('redirects to /connexion when not logged in', async () => {
    renderWizard(null);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/connexion'));
  });

  it('redirects to / when already onboarded', async () => {
    renderWizard(onboardedAccount);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('shows loading state while session loads', () => {
    renderWizard(null, true);
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── Step 1 — "Qui êtes-vous ?" ───────────────────────────────────────────────

  it('renders Step 1 heading "Qui êtes-vous ?"', () => {
    renderWizard();
    expect(screen.getByText('Qui êtes-vous ?')).toBeInTheDocument();
  });

  it('shows Étape 1 progress', () => {
    renderWizard();
    expect(screen.getByText(/Étape 1/)).toBeInTheDocument();
  });

  it('renders "Scénariste", "Dessinateur·rice", "Je suis là pour lire" chips', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /scénariste/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dessinateur·rice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /je suis là pour lire/i })).toBeInTheDocument();
  });

  it('toggles Scénariste chip: aria-pressed true when selected', async () => {
    const user = userEvent.setup();
    renderWizard();
    const chip = screen.getByRole('button', { name: /scénariste/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles Dessinateur·rice independently from Scénariste', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /dessinateur·rice/i }));
    expect(screen.getByRole('button', { name: /scénariste/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /dessinateur·rice/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Je suis là pour lire" deselects creator roles', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /dessinateur·rice/i }));
    await user.click(screen.getByRole('button', { name: /je suis là pour lire/i }));
    expect(screen.getByRole('button', { name: /scénariste/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /dessinateur·rice/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selecting a creator role deselects "Je suis là pour lire"', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /je suis là pour lire/i }));
    expect(screen.getByRole('button', { name: /je suis là pour lire/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    expect(screen.getByRole('button', { name: /je suis là pour lire/i })).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Step 1 → Step 2 navigation ───────────────────────────────────────────────

  it('"Suivant" on step 1 advances to step 2 "Vos genres & affinités"', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
  });

  it('"Passer" on step 1 clears selection and advances to step 2', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /passer/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
  });

  // ── Step 2 — "Vos genres & affinités" ────────────────────────────────────────

  it('shows genre chips from ONBOARDING_GENRE_TAGS on step 2', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    // Check a subset of chips
    expect(screen.getByRole('button', { name: /seinen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thriller/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /romance/i })).toBeInTheDocument();
  });

  it('genre chips are multi-select toggles', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    const chip = screen.getByRole('button', { name: /seinen/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Second chip can also be selected independently
    const chip2 = screen.getByRole('button', { name: /thriller/i });
    await user.click(chip2);
    expect(chip2).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Reader path (no step 3) ───────────────────────────────────────────────────

  it('reader path: primary button on step 2 is "C\'est parti !" (no step 3)', async () => {
    const user = userEvent.setup();
    renderWizard();
    // Skip step 1 (reader path: no creator role)
    await user.click(screen.getByRole('button', { name: /passer/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /c'est parti/i })).toBeInTheDocument();
    expect(screen.queryByText(/étape 3/i)).not.toBeInTheDocument();
  });

  it('reader path: "C\'est parti !" on step 2 submits and navigates to /', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /passer/i })); // skip step 1
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /seinen/i }));
    await user.click(screen.getByRole('button', { name: /c'est parti/i }));
    await waitFor(() => expect(api.completeOnboarding).toHaveBeenCalledWith({ tags: ['Seinen'] }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('reader path: full skip (Passer on both steps) submits empty body', async () => {
    const user = userEvent.setup();
    renderWizard();
    // Passer step 1
    await user.click(screen.getByRole('button', { name: /passer/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    // Passer step 2 (last step for reader)
    await user.click(screen.getByRole('button', { name: /passer/i }));
    await waitFor(() => expect(api.completeOnboarding).toHaveBeenCalledWith({}));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  // ── Creator path (includes step 3) ────────────────────────────────────────────

  it('creator path: Suivant on step 2 shows step 3 "Que cherchez-vous ?"', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i })); // step 1 → step 2
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /suivant/i })); // step 2 → step 3
    await waitFor(() => expect(screen.getByText('Que cherchez-vous ?')).toBeInTheDocument());
  });

  it('step 3 shows 4 French looking-for options', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Que cherchez-vous ?')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /je cherche un·e dessinateur·rice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /je cherche un·e scénariste/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ouvert·e aux propositions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /je regarde seulement/i })).toBeInTheDocument();
  });

  it('step 3 options are single-select (radio semantics)', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Que cherchez-vous ?')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /je cherche un·e dessinateur·rice/i }));
    await user.click(screen.getByRole('button', { name: /ouvert·e aux propositions/i }));
    expect(screen.getByRole('button', { name: /je cherche un·e dessinateur·rice/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /ouvert·e aux propositions/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('creator path: "C\'est parti !" on step 3 submits all accumulated data', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /thriller/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Que cherchez-vous ?')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /je cherche un·e scénariste/i }));
    await user.click(screen.getByRole('button', { name: /c'est parti/i }));
    await waitFor(() =>
      expect(api.completeOnboarding).toHaveBeenCalledWith({
        creatorRoles: ['scenariste'],
        tags: ['Thriller'],
        lookingFor: 'cherche_scenariste',
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('creator path: Passer on step 3 submits without lookingFor', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /scénariste/i }));
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(screen.getByText('Que cherchez-vous ?')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /passer/i }));
    await waitFor(() =>
      expect(api.completeOnboarding).toHaveBeenCalledWith({ creatorRoles: ['scenariste'] }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  // ── Error state ────────────────────────────────────────────────────────────────

  it('shows error message on failed submit and preserves selections', async () => {
    vi.mocked(api.completeOnboarding).mockRejectedValueOnce({ statusCode: 500, message: 'Erreur' });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: /passer/i })); // step 1 → step 2
    await waitFor(() => expect(screen.getByText('Vos genres & affinités')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /seinen/i }));
    await user.click(screen.getByRole('button', { name: /c'est parti/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // Still on step 2 (not redirected)
    expect(mockReplace).not.toHaveBeenCalledWith('/');
    // Selection preserved
    expect(screen.getByRole('button', { name: /seinen/i })).toHaveAttribute('aria-pressed', 'true');
  });

  // ── A11y ──────────────────────────────────────────────────────────────────────

  it('has a role="status" aria-live region announcing step progress', () => {
    renderWizard();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('progress region contains "Étape 1"', () => {
    renderWizard();
    expect(screen.getByRole('status')).toHaveTextContent(/Étape 1/);
  });

  it('wizard root has role="dialog" with aria-labelledby pointing to step heading', () => {
    renderWizard();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId!);
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toMatch(/Qui êtes-vous/);
  });
});
