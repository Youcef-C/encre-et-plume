import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';
import CguReconsentModal from '../components/CguReconsentModal';

vi.mock('../lib/api', () => ({
  getLegalDocument: vi.fn().mockResolvedValue({
    kind: 'cgu',
    version: '1.0',
    content: '<h1>CGU</h1>',
    publishedAt: '2026-01-01T00:00:00.000Z',
  }),
  recordConsent: vi.fn().mockResolvedValue({ recorded: true }),
}));

import * as api from '../lib/api';

const mockRefresh = vi.fn().mockResolvedValue(undefined);

const baseAccount: AccountSummary = {
  id: 'c1',
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

function renderModal(needsReconsent: boolean) {
  const account = { ...baseAccount, needsCguReconsent: needsReconsent };
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: mockRefresh, logout: vi.fn() }}
    >
      <CguReconsentModal />
    </SessionContext.Provider>,
  );
}

describe('CguReconsentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('not rendered when needsCguReconsent is false', () => {
    renderModal(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rendered when needsCguReconsent is true', () => {
    renderModal(true);
    expect(screen.getByRole('dialog', { name: /mise à jour de nos conditions/i })).toBeInTheDocument();
  });

  it('has a link to /cgu (opens new tab)', () => {
    renderModal(true);
    const link = screen.getByRole('link', { name: /conditions générales d'utilisation/i });
    expect(link).toHaveAttribute('href', '/cgu');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('"J\'accepte" calls getLegalDocument, recordConsent, and refresh', async () => {
    const user = userEvent.setup();
    renderModal(true);
    await user.click(screen.getByRole('button', { name: /j'accepte/i }));
    await waitFor(() => {
      expect(api.getLegalDocument).toHaveBeenCalledWith('cgu');
      expect(api.recordConsent).toHaveBeenCalledWith({ document: 'cgu', version: '1.0' });
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('has no close/dismiss button — only acceptance closes it', () => {
    renderModal(true);
    expect(screen.queryByRole('button', { name: /fermer|annuler|plus tard/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /j'accepte/i })).toBeInTheDocument();
  });
});
