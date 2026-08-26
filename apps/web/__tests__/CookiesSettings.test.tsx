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

  it('shows Activés / Désactivés for thirdParty per consent', () => {
    const { unmount } = renderWithConsent({ version: 1, audience: true, thirdParty: true });
    expect(screen.getByText(/contenus tiers/i).closest('div')).toHaveTextContent('Activés');
    unmount();
    renderWithConsent({ version: 1, audience: true, thirdParty: false });
    expect(screen.getByText(/contenus tiers/i).closest('div')).toHaveTextContent('Désactivés');
  });

  it('shows Désactivés for thirdParty when consent is null', () => {
    renderWithConsent(null);
    expect(screen.getByText(/contenus tiers/i).closest('div')).toHaveTextContent('Désactivés');
  });

  // F-23 · B-3: measurement is cookieless and always on, so the row states a fact instead of
  // rendering a preference that nothing ever sets (it read « Désactivés » while measuring).
  it('states audience measurement as a cookieless always-on fact, never as a toggle state', () => {
    renderWithConsent({ version: 1, audience: false, thirdParty: false });
    const audienceRow = screen.getByText(/mesure d.audience/i).closest('div')!;
    expect(audienceRow).toHaveTextContent(/sans cookie/i);
    expect(audienceRow).toHaveTextContent(/toujours active/i);
    expect(audienceRow).toHaveTextContent(/aucun identifiant n.est stocké/i);
    expect(audienceRow).not.toHaveTextContent(/désactivés/i);
    expect(audienceRow).not.toHaveTextContent(/activés/i);
  });

  it('renders the same audience statement whatever the stored audience flag says', () => {
    const { unmount } = renderWithConsent({ version: 1, audience: false, thirdParty: false });
    const off = screen.getByText(/mesure d.audience/i).closest('div')!.textContent;
    unmount();
    renderWithConsent({ version: 1, audience: true, thirdParty: false });
    expect(screen.getByText(/mesure d.audience/i).closest('div')!.textContent).toBe(off);
  });

  it('links the audience statement to Article 9 bis of the privacy policy', () => {
    renderWithConsent(null);
    const link = screen.getByRole('link', { name: /article 9 bis/i });
    expect(link).toHaveAttribute('href', '/confidentialite');
  });

  it('calls reopen when clicking "Gérer les cookies"', async () => {
    const user = userEvent.setup();
    const { reopen } = renderWithConsent({ version: 1, audience: false, thirdParty: false });
    await user.click(screen.getByRole('button', { name: /gérer les cookies/i }));
    expect(reopen).toHaveBeenCalled();
  });
});
