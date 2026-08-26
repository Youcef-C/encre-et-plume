import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsentProvider } from '../lib/cookie-consent';
import CookieBanner from '../components/CookieBanner';

const STORAGE_KEY = 'ep_cookie_consent';

function renderBanner() {
  return render(
    <CookieConsentProvider>
      <CookieBanner />
    </CookieConsentProvider>,
  );
}

describe('CookieBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shown when no stored consent choice', () => {
    renderBanner();
    expect(screen.getByRole('dialog', { name: /gestion des cookies/i })).toBeInTheDocument();
  });

  it('hidden when consent already stored', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, audience: false, thirdParty: false }));
    renderBanner();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Tout accepter" persists audience+thirdParty=true and hides banner', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /tout accepter/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toMatchObject({ version: 1, audience: true, thirdParty: true });
  });

  it('"Tout refuser" persists audience+thirdParty=false and hides banner', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /tout refuser/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toMatchObject({ version: 1, audience: false, thirdParty: false });
  });

  it('"Tout accepter" and "Tout refuser" share the same className (equal prominence)', () => {
    renderBanner();
    const acceptBtn = screen.getByRole('button', { name: /tout accepter/i });
    const refuseBtn = screen.getByRole('button', { name: /tout refuser/i });
    expect(acceptBtn.className).toBe(refuseBtn.className);
  });

  it('"Personnaliser" reveals the two consent-gated categories', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /personnaliser/i }));
    expect(screen.getByLabelText(/essentiels/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contenus tiers/i)).toBeInTheDocument();
  });

  // F-23 · B-3: audience measurement is cookieless and exempt from consent — a checkbox for it
  // controlled nothing and implied the opposite.
  it('offers no "Mesure d\'audience" checkbox', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /personnaliser/i }));
    expect(screen.queryByLabelText(/mesure d'audience/i)).not.toBeInTheDocument();
  });

  it('essentiels toggle is disabled and always checked', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /personnaliser/i }));
    const essentiels = screen.getByLabelText(/essentiels/i);
    expect(essentiels).toBeDisabled();
    expect(essentiels).toBeChecked();
  });

  it('"Enregistrer mes choix" saves custom preferences and hides banner', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: /personnaliser/i }));
    // Toggle contenus tiers on (starts off)
    await user.click(screen.getByLabelText(/contenus tiers/i));
    await user.click(screen.getByRole('button', { name: /enregistrer mes choix/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toMatchObject({ version: 1, thirdParty: true });
  });
});
