import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    // one typed call, not one per keystroke (the '' call is the idle contacts fetch)
    expect(vi.mocked(api.searchAccounts).mock.calls.filter(([q]) => q !== '')).toEqual([['lé']]);
  });

  // Contacts-DM follow-up: the idle state is the caller's contacts (GET /accounts/search with an
  // empty q) — that's what replaced the retired "Contacts" dropdown in the pickers.
  it('lists the caller contacts on an empty/whitespace query', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user({ isContact: true })] });
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);

    expect(await screen.findByRole('option', { name: /Léa B\./ })).toBeInTheDocument();
    expect(screen.getByText('Vos contacts')).toBeInTheDocument();
    expect(api.searchAccounts).toHaveBeenCalledWith('');

    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), '   ');
    await new Promise((r) => setTimeout(r, 400));
    expect(api.searchAccounts).toHaveBeenCalledTimes(1); // whitespace stays the idle state
  });

  // Regression: Escape on an empty field used to wipe the idle contacts list for good. `setQuery('')`
  // is a no-op when the query is already empty, so the fetch effect never re-ran to restore it, and a
  // user WITH contacts was told "Aucun contact pour l'instant". Escape must leave the idle list alone.
  it('keeps the idle contacts list when Escape is pressed on an empty field', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user({ isContact: true })] });
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);

    const box = screen.getByRole('combobox', { name: 'Rechercher une personne' });
    expect(await screen.findByRole('option', { name: /Léa B\./ })).toBeInTheDocument();

    box.focus();
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('option', { name: /Léa B\./ })).toBeInTheDocument();
    expect(screen.getByText('Vos contacts')).toBeInTheDocument();
  });

  it('still clears a typed query on Escape', async () => {
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    const box = screen.getByRole('combobox', { name: 'Rechercher une personne' });
    await userEvent.type(box, 'lé');
    await waitFor(() => expect(api.searchAccounts).toHaveBeenCalledWith('lé'));

    await userEvent.keyboard('{Escape}');
    expect(box).toHaveValue('');
  });

  it('marks a contact among the search results', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({
      items: [user({ isContact: true }), user({ id: 'u-noe', name: 'Noé P.', slug: 'noe-p' })],
    });
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), 'e');

    const contactRow = await screen.findByRole('option', { name: /Léa B\./ });
    expect(within(contactRow).getByText('Contact')).toBeInTheDocument();
    expect(within(await screen.findByRole('option', { name: /Noé P\./ })).queryByText('Contact')).toBeNull();
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

  // Round 2: every contact already picked (all in excludeIds) is NOT "no contacts" — the idle hint
  // must key on what the server returned, not on what is left after the caller's exclusions.
  it('does not claim the user has no contacts when they are all already selected', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({ items: [user({ isContact: true })] });
    render(<ReachableUserSearch excludeIds={['u-lea']} onPick={vi.fn()} label="Rechercher une personne" />);
    await waitFor(() => expect(api.searchAccounts).toHaveBeenCalledWith(''));
    expect(screen.queryByText(/Aucun contact pour l’instant/)).not.toBeInTheDocument();
  });

  it('shows "Aucun résultat" when the search returns nothing', async () => {
    vi.mocked(api.searchAccounts).mockResolvedValue({ items: [] });
    render(<ReachableUserSearch excludeIds={[]} onPick={vi.fn()} label="Rechercher une personne" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Rechercher une personne' }), 'zzz');
    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
  });
});
