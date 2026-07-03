// Theme picker is disabled for now: light mode is forced everywhere.
// The full F-6 picker test suite (light/dark/system, account sync) lives in git history.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../lib/theme';

function ThemeConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>Sombre</button>
    </div>
  );
}

describe('ThemeProvider — forced light mode', () => {
  it('always exposes theme "light"', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('pins data-theme="light" on the document element', () => {
    document.documentElement.dataset.theme = 'dark'; // stale cookie / old preference
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('setTheme is a no-op', async () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sombre' }));
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
