import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsentProvider } from '../lib/cookie-consent';
import LegalFooter from '../components/LegalFooter';
import CookieBanner from '../components/CookieBanner';

const STORAGE_KEY = 'ep_cookie_consent';

describe('LegalFooter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function renderFooter() {
    return render(
      <CookieConsentProvider>
        <LegalFooter />
      </CookieConsentProvider>,
    );
  }

  it('renders CGU link pointing to /cgu', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: /^cgu$/i });
    expect(link).toHaveAttribute('href', '/cgu');
  });

  it('renders "Politique de confidentialité" link pointing to /confidentialite', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: /politique de confidentialité/i });
    expect(link).toHaveAttribute('href', '/confidentialite');
  });

  it('renders "Mentions légales" link pointing to /mentions-legales', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: /mentions légales/i });
    expect(link).toHaveAttribute('href', '/mentions-legales');
  });

  it('renders "Aide & contact" link pointing to /contact', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: /aide & contact/i });
    expect(link).toHaveAttribute('href', '/contact');
  });

  it('renders © Encre & Plume', () => {
    renderFooter();
    expect(screen.getByText(/© encre & plume/i)).toBeInTheDocument();
  });

  it('"Gérer les cookies" reopens the banner after it was dismissed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, audience: false, thirdParty: false }));
    const user = userEvent.setup();
    render(
      <CookieConsentProvider>
        <LegalFooter />
        <CookieBanner />
      </CookieConsentProvider>,
    );
    // Banner not shown initially (consent stored)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Click "Gérer les cookies"
    await user.click(screen.getByRole('button', { name: /gérer les cookies/i }));
    // Banner now shows
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
