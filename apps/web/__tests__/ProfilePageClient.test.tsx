import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ProfileResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ProfileActions (rendered for visitors) uses next/navigation's useRouter (MC-3 invite gating).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  getMyProjects: vi.fn().mockResolvedValue({ items: [] }),
  createInvitation: vi.fn(),
  getProfilePortfolio: vi.fn().mockResolvedValue([]),
  updateMyProfile: vi.fn().mockResolvedValue({}),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  // F-10 media functions (used by UploadControl + ProfilePageClient avatar flow)
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
  setAvatar: vi.fn().mockResolvedValue({}),
  buildSrcSet: vi.fn().mockReturnValue(''),
  // F-10 delete avatar
  deleteAvatar: vi.fn().mockResolvedValue({ avatar: null }),
}));

// Stub AvatarCropModal so no canvas/react-easy-crop needed here
vi.mock('../components/AvatarCropModal', () => ({
  default: () => <div data-testid="avatar-crop-modal" />,
}));

// Stub UploadControl — captures onBusyChange for save-button tests
let capturedOnBusyChange: ((busy: boolean) => void) | undefined;
vi.mock('../components/UploadControl', () => ({
  default: ({
    label,
    onBusyChange,
  }: {
    label: string;
    onBusyChange?: (busy: boolean) => void;
  }) => {
    capturedOnBusyChange = onBusyChange;
    return (
      <div>
        <div>{label}</div>
        <div>Glissez une image ou cliquez pour choisir</div>
      </div>
    );
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { getProfile, updateMyProfile, deleteAvatar } from '../lib/api';
import ProfilePageClient from '../components/ProfilePageClient';

const mockProfile: ProfileResponse = {
  userId: 'yuki-1',
  slug: 'yuki-moreau',
  displayName: 'Yuki Moreau',
  avatar: null,
  coverImage: null,
  roleLine: 'encre & screentone · Lyon, FR',
  specialty: 'encre & screentone',
  city: 'Lyon, FR',
  bio: 'Ma biographie.',
  seeking: {
    active: true,
    targetRole: 'scénariste',
    genres: ['Seinen', 'Thriller'],
    projectLength: 'projet long',
    text: 'Cherche actuellement un·e scénariste — Seinen / Thriller, projet long',
  },
  tags: ['Seinen', 'Thriller'],
  counters: { followers: 0, likes: 0, works: 0, supporters: 0 },
  country: 'FR',
  region: 'Bretagne',
  creatorRoles: ['dessinateur'],
  availability: 'ouvert',
  viewerHasBlocked: false,
  blockedByTarget: false,
  connectionState: 'none',
};

const mockAccount: AccountSummary = {
  id: 'a1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
  onboarded: false,
  isAdult: true,
};

function renderProfile(slug: string, account: AccountSummary | null = null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <ProfilePageClient slug={slug} />
    </SessionContext.Provider>
  );
}

// OnBrandSelect is a combobox listbox (§8): open the "Pays" trigger, then click the country option.
async function pickCountry(user: ReturnType<typeof userEvent.setup>, optionLabel: string) {
  await user.click(screen.getByLabelText('Pays'));
  await user.click(screen.getByRole('option', { name: optionLabel }));
}

beforeEach(() => {
  capturedOnBusyChange = undefined;
});

describe('ProfilePageClient — loading', () => {
  it('shows loading state initially', () => {
    vi.mocked(getProfile).mockReturnValue(new Promise(() => {}));
    renderProfile('yuki-moreau');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ProfilePageClient — loaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  it('renders displayName', async () => {
    renderProfile('yuki-moreau');
    expect(await screen.findByText('Yuki Moreau')).toBeInTheDocument();
  });

  it('renders roleLine when present', async () => {
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(screen.getByText('encre & screentone · Lyon, FR')).toBeInTheDocument();
  });

  it('renders seeking banner when seeking.active is true', async () => {
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(
      screen.getByText(/cherche actuellement un·e scénariste/i)
    ).toBeInTheDocument();
  });

  it('does not render seeking banner when seeking.active is false', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ...mockProfile,
      seeking: { ...mockProfile.seeking, active: false, text: null },
    });
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(screen.queryByText(/cherche actuellement/i)).not.toBeInTheDocument();
  });

  it('renders stats row (abonnés, J\'aime, œuvres, soutiens)', async () => {
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(screen.getByText('abonnés')).toBeInTheDocument();
    expect(screen.getByText(/j'aime/i)).toBeInTheDocument();
    expect(screen.getByText('œuvres')).toBeInTheDocument();
    expect(screen.getByText('soutiens')).toBeInTheDocument();
  });

  it('renders the "Genres & affinités" section label', async () => {
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(screen.getByText(/genres & affinités/i)).toBeInTheDocument();
  });

  it('renders the tablist', async () => {
    renderProfile('yuki-moreau');
    await screen.findByText('Yuki Moreau');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

describe('ProfilePageClient — visitor view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
  });

  it('shows action buttons for visitor (no session)', async () => {
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');
    expect(screen.getByRole('button', { name: /suivre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /soutenir/i })).toBeInTheDocument();
  });

  it('does not show "Modifier le profil" for visitor', async () => {
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');
    expect(screen.queryByRole('button', { name: /modifier le profil/i })).not.toBeInTheDocument();
  });
});

describe('ProfilePageClient — owner view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
  });

  it('shows "Modifier le profil" button for owner', async () => {
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    expect(screen.getByRole('button', { name: /modifier le profil/i })).toBeInTheDocument();
  });

  it('does not show visitor action buttons for owner', async () => {
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    // "＋ Se connecter" is only for visitors
    expect(screen.queryByRole('button', { name: /se connecter/i })).not.toBeInTheDocument();
  });

  it('clicking "Modifier le profil" shows edit form with "Enregistrer" and "Annuler"', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /annuler/i })).toBeInTheDocument();
  });

  it('"Annuler" exits edit mode', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByRole('button', { name: /annuler/i }));
    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument();
  });

  it('shows UploadControl for avatar when edit mode is active (F-10)', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    // The UploadControl drop zone should appear with its label
    expect(screen.getByText('Photo de profil')).toBeInTheDocument();
    expect(screen.getByText(/Glissez une image/i)).toBeInTheDocument();
  });

  it('"Enregistrer" calls updateMyProfile and exits edit mode', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(vi.mocked(updateMyProfile)).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument()
    );
  });
});

describe('ProfilePageClient — seeking "Genres" chip picker (F-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
  }

  // Scoped to the seeking "Genres" panel only — the tag cloud ("Genres &
  // affinités") uses the same mock tags ('Seinen', 'Thriller') and (round 1b)
  // now renders identical "Retirer <tag>" chips, so an unscoped query would
  // match both sections.
  function seekingGenresPanel() {
    return screen.getByText('Genres', { exact: true }).closest('div') as HTMLElement;
  }

  it('label reads "Genres" without "séparés par virgule"', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    expect(screen.getByText('Genres')).toBeInTheDocument();
    expect(screen.queryByText(/séparés par virgule/i)).not.toBeInTheDocument();
  });

  it('renders existing seeking genres as removable chips', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const panel = within(seekingGenresPanel());
    expect(panel.getByRole('button', { name: /retirer seinen/i })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /retirer thriller/i })).toBeInTheDocument();
  });

  it('adding a vocabulary genre via the suggestion input renders a new removable chip', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const input = screen.getByRole('combobox', { name: /ajouter un genre/i });
    await user.type(input, 'Dark Fantasy');
    await user.keyboard('{Enter}');
    expect(
      await within(seekingGenresPanel()).findByRole('button', { name: /retirer dark fantasy/i })
    ).toBeInTheDocument();
  });

  it('clicking "Retirer" removes the chip', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const panel = within(seekingGenresPanel());
    await user.click(panel.getByRole('button', { name: /retirer seinen/i }));
    expect(panel.queryByRole('button', { name: /retirer seinen/i })).not.toBeInTheDocument();
    expect(panel.getByRole('button', { name: /retirer thriller/i })).toBeInTheDocument();
  });

  it('adding a genre that already exists (case-insensitive) is a no-op', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const input = screen.getByRole('combobox', { name: /ajouter un genre/i });
    await user.type(input, 'seinen');
    await user.keyboard('{Enter}');
    expect(
      within(seekingGenresPanel()).getAllByRole('button', { name: /retirer seinen/i })
    ).toHaveLength(1);
  });

  it('persists the updated seeking.genres on save', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const input = screen.getByRole('combobox', { name: /ajouter un genre/i });
    await user.type(input, 'Dark Fantasy');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() =>
      expect(vi.mocked(updateMyProfile)).toHaveBeenCalledWith(
        expect.objectContaining({
          seeking: expect.objectContaining({
            genres: expect.arrayContaining(['Seinen', 'Thriller', 'Dark Fantasy']),
          }),
        })
      )
    );
  });
});

describe('ProfilePageClient — edit form ergonomics pass (on-brand controls + sections)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
  }

  it('groups the form into titled sections: a "Photo de profil" group, "Informations", and "Recherche de partenaire"', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    expect(screen.getByRole('group', { name: 'Photo de profil' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Informations' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Recherche de partenaire' })).toBeInTheDocument();
  });

  it('the "Recherche un·e" select uses the on-brand platform select styling (bold, ink border, matching FilterSidebar)', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const select = screen.getByRole('combobox', { name: /recherche un/i }) as HTMLSelectElement;
    expect(select.style.fontWeight).toBe('700');
    expect(select.style.border).toBe('2px solid var(--ink)');
  });

  it('the "Recherche active" control is a real checkbox with an accessible name, keyboard-toggleable', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const checkbox = screen.getByRole('checkbox', { name: /recherche active/i });
    expect(checkbox).toBeChecked(); // mock profile has seeking.active: true
    checkbox.focus();
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
    // Sub-fields (role select, genres, project length) hide once inactive.
    expect(screen.queryByRole('combobox', { name: /recherche un/i })).not.toBeInTheDocument();
  });

  it('anchors Enregistrer/Annuler at the end of the form, after the last section', async () => {
    const user = userEvent.setup();
    await openEdit(user);
    const projectLengthInput = screen.getByLabelText('Longueur de projet');
    const saveBtn = screen.getByRole('button', { name: /enregistrer/i });
    // eslint-disable-next-line no-bitwise
    expect(
      projectLengthInput.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('ProfilePageClient — blocked-by-target disclosure (MC-10 round 2, F9)', () => {
  it('renders "Profil indisponible" + the disclosure copy and hides the profile shell', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...mockProfile, blockedByTarget: true });
    renderProfile('yuki-moreau', { ...mockAccount, slug: 'camille-r' } as AccountSummary);
    expect(await screen.findByText('Profil indisponible')).toBeInTheDocument();
    expect(screen.getByText('Cet utilisateur vous a bloqué·e.')).toBeInTheDocument();
    // No profile shell: no tabs, no action buttons, no stats.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suivre/i })).not.toBeInTheDocument();
    expect(screen.queryByText('abonnés')).not.toBeInTheDocument();
  });
});

describe('ProfilePageClient — "Bloqué" pill placement (MC-10 round 2, F9)', () => {
  it('renders the "Bloqué" pill in the name block (not the action row) when the viewer has blocked this profile', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...mockProfile, viewerHasBlocked: true });
    renderProfile('yuki-moreau', { ...mockAccount, slug: 'camille-r' } as AccountSummary);
    // The pill lives next to the <h1> name, not inside the visitor action-button row.
    const pill = await screen.findByText('Bloqué');
    expect(pill).toBeInTheDocument();
    expect(pill.closest('[role="dialog"]')).toBeNull();
    // Actions are still present (the pill was moved out of, not instead of, the action row).
    expect(screen.getByRole('button', { name: /proposer une collab/i })).toBeInTheDocument();
  });

  it('does not render the pill when the viewer has not blocked this profile', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...mockProfile, viewerHasBlocked: false });
    renderProfile('yuki-moreau', { ...mockAccount, slug: 'camille-r' } as AccountSummary);
    expect(await screen.findByRole('button', { name: /proposer une collab/i })).toBeInTheDocument();
    expect(screen.queryByText('Bloqué')).not.toBeInTheDocument();
  });
});

describe('ProfilePageClient — error state', () => {
  it('shows error message when profile fetch fails with 404', async () => {
    vi.mocked(getProfile).mockRejectedValue({
      statusCode: 404,
      message: 'Profil introuvable',
      error: 'NOT_FOUND',
    });
    renderProfile('inconnu');
    expect(await screen.findByText(/profil introuvable/i)).toBeInTheDocument();
  });
});

describe('ProfilePageClient — avatar delete (F-10 enhancement)', () => {
  const mockRefresh = vi.fn().mockResolvedValue(undefined);

  function renderOwnerWithAvatar() {
    const profileWithAvatar: ProfileResponse = {
      ...mockProfile,
      avatar: 'https://cdn/avatar/web.webp',
    };
    vi.mocked(getProfile).mockResolvedValue(profileWithAvatar);
    return render(
      <SessionContext.Provider
        value={{ account: mockAccount, loading: false, refresh: mockRefresh, logout: vi.fn() }}
      >
        <ProfilePageClient slug="yuki-moreau" />
      </SessionContext.Provider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteAvatar).mockResolvedValue({
      ...mockAccount,
      avatar: null,
    });
    // jsdom stubs for URL blob APIs (used by UploadControl crop flow inside edit panel)
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });

  it('does not show "Supprimer la photo" when avatar is null', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...mockProfile, avatar: null });
    renderProfile('yuki-moreau', mockAccount);
    const user = userEvent.setup();
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    expect(screen.queryByRole('button', { name: /supprimer la photo/i })).not.toBeInTheDocument();
  });

  it('shows "Supprimer la photo" button in edit mode when owner has avatar', async () => {
    renderOwnerWithAvatar();
    const user = userEvent.setup();
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    expect(screen.getByRole('button', { name: /supprimer la photo/i })).toBeInTheDocument();
  });

  it('clicking "Supprimer la photo" shows confirm dialog', async () => {
    renderOwnerWithAvatar();
    const user = userEvent.setup();
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByRole('button', { name: /supprimer la photo/i }));
    expect(screen.getByText(/supprimer la photo de profil/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /oui, supprimer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Non$/i })).toBeInTheDocument();
  });

  it('"Non" cancels and restores delete button', async () => {
    renderOwnerWithAvatar();
    const user = userEvent.setup();
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByRole('button', { name: /supprimer la photo/i }));
    await user.click(screen.getByRole('button', { name: /^Non$/i }));
    expect(screen.getByRole('button', { name: /supprimer la photo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /oui, supprimer/i })).not.toBeInTheDocument();
    expect(deleteAvatar).not.toHaveBeenCalled();
  });

  it('"Oui, supprimer" calls deleteAvatar, clears avatar, and refreshes session', async () => {
    renderOwnerWithAvatar();
    const user = userEvent.setup();
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByRole('button', { name: /supprimer la photo/i }));
    await user.click(screen.getByRole('button', { name: /oui, supprimer/i }));

    await waitFor(() => expect(deleteAvatar).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());

    // After deletion, "Supprimer la photo" button should disappear (avatar is null now)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /supprimer la photo/i })).not.toBeInTheDocument(),
    );
  });

  it('avatar img has object-fit cover style', async () => {
    renderOwnerWithAvatar();
    await screen.findByText('Yuki Moreau');
    // Avatar now has role="button" for lightbox trigger; query by alt text instead
    const img = screen.getByAltText('Yuki Moreau');
    expect(img).toHaveStyle({ objectFit: 'cover' });
  });
});

describe('ProfilePageClient — save button disabled while upload is busy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  it('Enregistrer is enabled initially in edit mode', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect(btn).not.toBeDisabled();
  });

  it('Enregistrer is disabled and shows hint when upload is busy', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));

    // Simulate UploadControl reporting busy
    expect(capturedOnBusyChange).toBeDefined();
    capturedOnBusyChange!(true);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /optimisation en cours/i });
      expect(btn).toBeDisabled();
    });
  });

  it('Enregistrer is re-enabled when upload finishes', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));

    capturedOnBusyChange!(true);
    await waitFor(() => expect(screen.getByRole('button', { name: /optimisation en cours/i })).toBeDisabled());

    capturedOnBusyChange!(false);
    await waitFor(() => expect(screen.getByRole('button', { name: /enregistrer/i })).not.toBeDisabled());
  });
});

describe('ProfilePageClient — avatar fullscreen lightbox', () => {
  const profileWithAvatar: ProfileResponse = {
    ...mockProfile,
    avatar: 'https://cdn/avatar/web.webp',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(profileWithAvatar);
  });

  it('clicking the avatar img opens the fullscreen lightbox dialog', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');

    // Avatar now has role="button" for lightbox; query by its aria-label
    const avatarBtn = screen.getByRole('button', { name: /voir la photo de profil/i });
    await user.click(avatarBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('✕ button closes the lightbox', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');

    await user.click(screen.getByRole('button', { name: /voir la photo de profil/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /fermer/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clicking the backdrop closes the lightbox', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');

    await user.click(screen.getByRole('button', { name: /voir la photo de profil/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Click directly on the dialog backdrop (the dialog element itself)
    await user.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Escape key closes the lightbox', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');

    await user.click(screen.getByRole('button', { name: /voir la photo de profil/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('halftone fallback (no avatar) renders no clickable lightbox trigger', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ...mockProfile, avatar: null });
    renderProfile('yuki-moreau', null);
    await screen.findByText('Yuki Moreau');

    // No img with button role (halftone is aria-hidden)
    expect(screen.queryByRole('img', { name: /yuki moreau/i })).not.toBeInTheDocument();
    // No lightbox trigger button
    expect(screen.queryByRole('button', { name: /voir la photo/i })).not.toBeInTheDocument();
  });
});

describe('ProfilePageClient — MC-1 country + région location (round 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  it('shows the composed location (French région) in read mode', async () => {
    renderProfile('yuki-moreau', null);
    expect(await screen.findByText('Bretagne')).toBeInTheDocument();
  });

  it('offers "Pays" with French country names and no "Ville" input in edit mode', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await user.click(screen.getByLabelText('Pays')); // open the combobox listbox
    expect(screen.getByRole('option', { name: 'Japon' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ville')).not.toBeInTheDocument();
  });

  it('shows the "Région" select only when the country is France', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    // fixture country = FR → Région visible
    expect(screen.getByLabelText('Région')).toBeInTheDocument();
    await pickCountry(user, 'Japon');
    expect(screen.queryByLabelText('Région')).not.toBeInTheDocument();
  });

  it('PATCHes {country, region} with region nulled when leaving France, and never sends city', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    await pickCountry(user, 'Japon');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalled());
    const body = vi.mocked(updateMyProfile).mock.calls[0][0];
    expect(body).toMatchObject({ country: 'JP', region: null });
    expect(body).not.toHaveProperty('city');
  });
});

describe('ProfilePageClient — MC-1 §9 creator type(s)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    vi.mocked(updateMyProfile).mockResolvedValue(mockProfile);
  });

  it('shows the creator role(s) in read mode', async () => {
    renderProfile('yuki-moreau', null);
    expect(await screen.findByText('Dessinateur·rice')).toBeInTheDocument();
  });

  it('lets the owner add a second creator type via toggle buttons and PATCHes both', async () => {
    const user = userEvent.setup();
    renderProfile('yuki-moreau', mockAccount);
    await screen.findByText('Yuki Moreau');
    await user.click(screen.getByRole('button', { name: /modifier le profil/i }));
    const scenariste = screen.getByRole('button', { name: 'Scénariste' });
    expect(scenariste).toHaveAttribute('aria-pressed', 'false');
    await user.click(scenariste);
    expect(scenariste).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalled());
    const body = vi.mocked(updateMyProfile).mock.calls[0][0];
    expect(body.creatorRoles).toEqual(['dessinateur', 'scenariste']);
  });
});
