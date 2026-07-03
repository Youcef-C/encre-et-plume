import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsentContext } from '../lib/cookie-consent';
import type { CookieConsent } from '../lib/cookie-consent';
import CookiesSettings from '../components/settings/CookiesSettings';

function renderWithConsent(consent: CookieConsent | null, reopen = vi.fn()) {
  return {
    reopen,
    ...render(
      <CookieConsentContext.Provider
        value={{ consent, isSet: consent !== null, isOpen: false, save: vi.fn(), reopen }}
      >
        <CookiesSettings />
      </CookieConsentContext.Provider>
    ),
  };
}

describe('CookiesSettings', () => {
  it('shows Essentiels as always active', () => {
    renderWithConsent({ version: 1, audience: true, thirdParty: false });
    expect(screen.getByText(/essentiels/i)).toBeInTheDocument();
    expect(screen.getByText(/toujours actifs/i)).toBeInTheDocument();
  });

  it('shows Activés for audience and Désactivés for thirdParty per consent', () => {
    renderWithConsent({ version: 1, audience: true, thirdParty: false });
    const audienceRow = screen.getByText(/mesure d.audience/i).closest('div');
    const thirdPartyRow = screen.getByText(/contenus tiers/i).closest('div');
    expect(audienceRow).toHaveTextContent('Activés');
    expect(thirdPartyRow).toHaveTextContent('Désactivés');
  });

  it('shows Désactivés for both categories when consent is null', () => {
    renderWithConsent(null);
    const audienceRow = screen.getByText(/mesure d.audience/i).closest('div');
    const thirdPartyRow = screen.getByText(/contenus tiers/i).closest('div');
    expect(audienceRow).toHaveTextContent('Désactivés');
    expect(thirdPartyRow).toHaveTextContent('Désactivés');
  });

  it('calls reopen when clicking "Gérer les cookies"', async () => {
    const user = userEvent.setup();
    const { reopen } = renderWithConsent({ version: 1, audience: false, thirdParty: false });
    await user.click(screen.getByRole('button', { name: /gérer les cookies/i }));
    expect(reopen).toHaveBeenCalled();
  });
});
