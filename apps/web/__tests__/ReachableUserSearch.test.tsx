import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReachableUser } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  searchAccounts: vi.fn(),
}));

import * as api from '../lib/api';
import ReachableUserSearch from '../components/messaging/ReachableUserSearch';

const user = (over: Partial<ReachableUser> = {}): ReachableUser => ({
  id: 'u-lea',
  name: 'Léa B.',
  avatarUrl: null,
  slug: 'lea-b',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user()] });
});

describe('ReachableUserSearch', () => {
  it('debounces the input then calls searchAccounts with the trimmed query', async () => {
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), 'lé');
    await waitFor(() => expect(api.searchAccounts).toHaveBeenCalledWith('lé'));
    // one call, not one per keystroke
    expect(api.searchAccounts).toHaveBeenCalledTimes(1);
  });

  it('does not search on an empty/whitespace query', async () => {
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), '   ');
    await new Promise((r) => setTimeout(r, 400));
    expect(api.searchAccounts).not.toHaveBeenCalled();
  });

  it('renders suggestion rows and picks with a click, clearing the input', async () => {
    const onPick = vi.fn();
    render(<ReachableUserSearch excludeIds={[]} onPick={onPick} label="Rechercher une personne" />);
    const input = screen.getByRole('combobox', { name: 'Rechercher une personne' });
    await userEvent.type(input, 'lea');
    const option = await screen.findByRole('option', { name: /Léa B\./ });
    await userEvent.click(option);
    expect(onPick).toHaveBeenCalledWith(user());
    expect(input).toHaveValue('');
  });

  it('navigates suggestions with ArrowDown + Enter', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({
      items: [user(), user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' })],
    });
    const onPick = vi.fn();
    render(<ReachableUserSearch excludeIds={[]} onPick={onPick} label="Rechercher une personne" />);
    const input = screen.getByRole('combobox', { name: 'Rechercher une personne' });
    await userEvent.type(input, 'e');
    await screen.findByRole('option', { name: /Noé P\./ });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith(user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' }));
  });

  it('filters out excludeIds from the suggestions', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({
      items: [user(), user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' })],
    });
    render(<ReachableUserSearch excludeIds={['u-lea']} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), 'e');
    expect(await screen.findByRole('option', { name: /Noé P\./ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Léa B\./ })).not.toBeInTheDocument();
  });

  it('shows "Aucun résultat" when the search returns nothing', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({ items: [] });
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), 'zzz');
    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
  });
});
