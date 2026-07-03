import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeContext } from '../lib/theme';
import AppearanceSettings from '../components/settings/AppearanceSettings';

function renderWithTheme(theme: 'light' | 'dark' | 'system', setTheme = vi.fn()) {
  return {
    setTheme,
    ...render(
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <AppearanceSettings />
      </ThemeContext.Provider>
    ),
  };
}

describe('AppearanceSettings', () => {
  it('renders a labelled group with the three theme buttons', () => {
    renderWithTheme('system');
    expect(screen.getByRole('group', { name: 'Thème' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clair/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sombre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /système/i })).toBeInTheDocument();
  });

  it('marks the button matching the current theme as pressed', () => {
    renderWithTheme('system');
    expect(screen.getByRole('button', { name: /système/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /clair/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /sombre/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls setTheme("dark") when clicking Sombre', async () => {
    const user = userEvent.setup();
    const { setTheme } = renderWithTheme('light');
    await user.click(screen.getByRole('button', { name: /sombre/i }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme("system") when clicking Système', async () => {
    const user = userEvent.setup();
    const { setTheme } = renderWithTheme('light');
    await user.click(screen.getByRole('button', { name: /système/i }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });
});
