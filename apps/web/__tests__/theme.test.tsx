import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionContext } from '../lib/session';
import type { AccountSummary } from '@encre-et-plume/shared';

// Must be hoisted before imports of lib/theme which transitively imports lib/api
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    updateMyPreferences: vi.fn().mockResolvedValue({
      id: 'c1',
      displayName: 'Yuki',
      email: 'y@ex.com',
      role: 'utilisateur' as const,
      verified: false,
      emailVerified: true,
      slug: 'yuki',
      avatar: null,
      createdAt: new Date().toISOString(),
      preferences: { theme: 'dark' as const },
      needsCguReconsent: false,
  onboarded: false,
    }),
  };
});

import { ThemeProvider, ThemeContext, useTheme } from '../lib/theme';
import * as api from '../lib/api';

const mockAccount: AccountSummary = {
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
};

// Simple test component that exposes the theme context
function ThemeConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>Sombre</button>
      <button type="button" onClick={() => setTheme('light')}>Clair</button>
      <button type="button" onClick={() => setTheme('system')}>Système</button>
    </div>
  );
}

function renderWithTheme(account: AccountSummary | null = null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  vi.mocked(api.updateMyPreferences).mockClear();
  // Reset the html data-theme attribute between tests
  delete document.documentElement.dataset.theme;
});

describe('ThemeProvider / useTheme', () => {
  it('exposes theme from default context when used outside a provider', () => {
    render(<ThemeConsumer />);
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  it('defaults to system when no cookie/attribute is set', () => {
    renderWithTheme();
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  it('reads initial theme from html data-theme attribute', () => {
    document.documentElement.dataset.theme = 'dark';
    renderWithTheme();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('setTheme sets data-theme on documentElement immediately', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /sombre/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme updates the context theme state', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /clair/i }));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('setTheme writes the ep_theme cookie', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /sombre/i }));
    expect(document.cookie).toContain('ep_theme=dark');
  });

  it('setTheme("light") sets correct attribute and cookie', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /clair/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.cookie).toContain('ep_theme=light');
  });
});

describe('ThemeProvider — API integration', () => {
  it('calls updateMyPreferences when logged in and setTheme is called', async () => {
    const user = userEvent.setup();
    renderWithTheme(mockAccount);
    await user.click(screen.getByRole('button', { name: /sombre/i }));
    expect(vi.mocked(api.updateMyPreferences)).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('does not call updateMyPreferences when logged out', async () => {
    const user = userEvent.setup();
    renderWithTheme(null);
    await user.click(screen.getByRole('button', { name: /sombre/i }));
    expect(vi.mocked(api.updateMyPreferences)).not.toHaveBeenCalled();
  });

  it('syncs theme from account preferences on mount when account has explicit theme', async () => {
    const accountWithDark = { ...mockAccount, preferences: { theme: 'dark' as const } };
    renderWithTheme(accountWithDark);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  it('does not call updateMyPreferences during account sync (sync is one-way)', async () => {
    const accountWithDark = { ...mockAccount, preferences: { theme: 'dark' as const } };
    renderWithTheme(accountWithDark);
    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });
    // Account sync should NOT call updateMyPreferences (it's a read-from-account operation)
    expect(vi.mocked(api.updateMyPreferences)).not.toHaveBeenCalled();
  });
});
