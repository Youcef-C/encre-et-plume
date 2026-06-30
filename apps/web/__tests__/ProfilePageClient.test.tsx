import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ProfileResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn().mockResolvedValue([]),
  updateMyProfile: vi.fn().mockResolvedValue({}),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { getProfile, updateMyProfile } from '../lib/api';
import ProfilePageClient from '../components/ProfilePageClient';

const mockProfile: ProfileResponse = {
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
};

const mockAccount: AccountSummary = {
  id: 'a1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
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
