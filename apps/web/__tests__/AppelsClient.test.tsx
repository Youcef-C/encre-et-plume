import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountSummary, CallPreview } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getCalls: vi.fn() };
});

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
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const call: CallPreview = {
  id: 'call-1',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: '« Lames de Brume »',
  tags: ['Seinen'],
  authorName: 'Camille R.',
  closesInDays: 12,
  applicationCount: 0,
};

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <AppelsClient />
    </SessionContext.Provider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AppelsClient (§11)', () => {
  it('fetches up to 6 calls and lists them under a heading', async () => {
    (api.getCalls as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [call] });
    renderClient();
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
    expect(api.getCalls).toHaveBeenCalledWith(6);
    expect(screen.getByRole('heading', { name: 'Appels à projets' })).toBeInTheDocument();
    // this page is the board itself → no "Voir tous les appels" self-link
    expect(screen.queryByRole('link', { name: /voir tous les appels/i })).not.toBeInTheDocument();
  });

  it('shows an empty message when no call is open', async () => {
    (api.getCalls as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    renderClient();
    expect(await screen.findByText('Aucun appel ouvert pour le moment.')).toBeInTheDocument();
  });

  it('shows the connect prompt when logged out', () => {
    renderClient(null);
    expect(screen.getByText(/Connectez-vous pour parcourir les appels/)).toBeInTheDocument();
    expect(api.getCalls).not.toHaveBeenCalled();
  });
});
