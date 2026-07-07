import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MatchSuggestion, MatchSuggestionsResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getMatchSuggestions: vi.fn() };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import SuggestionsAside from '../components/trouver/SuggestionsAside';

const getMatchSuggestions = api.getMatchSuggestions as ReturnType<typeof vi.fn>;

function suggestion(overrides: Partial<MatchSuggestion> = {}): MatchSuggestion {
  return {
    userId: 'acc-lea',
    slug: 'mc1-lea-b',
    name: 'Léa B.',
    avatarUrl: null,
    role: 'scenariste',
    genre: 'Seinen',
    affinityScore: 94,
    reason: 'même genre · rythme compatible',
    ...overrides,
  };
}

function res(items: MatchSuggestion[], incompleteProfile = false): MatchSuggestionsResponse {
  return { items, incompleteProfile };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMatchSuggestions.mockResolvedValue(res([suggestion()]));
});

describe('SuggestionsAside', () => {
  it('labels the aside with the panel title and shows the title + subtitle lockup', async () => {
    render(<SuggestionsAside onProposer={vi.fn()} />);
    const aside = await screen.findByRole('complementary', {
      name: 'Suggestions — par affinité de style & genre',
    });
    expect(aside).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText('par affinité de style & genre')).toBeInTheDocument();
  });

  it('renders a card with name, "role · genre" line, reason, and the % score announced with "affinité"', async () => {
    render(<SuggestionsAside onProposer={vi.fn()} />);
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
    expect(screen.getByText('Scénariste · Seinen')).toBeInTheDocument();
    expect(screen.getByText('même genre · rythme compatible')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    // sr-only "affinité" prefix so screen readers announce "affinité 94%" (exact match skips the subtitle)
    expect(screen.getByText('affinité')).toBeInTheDocument();
  });

  it('omits the genre when it is null, showing the role alone', async () => {
    getMatchSuggestions.mockResolvedValue(
      res([suggestion({ genre: null, reason: 'style proche de vos refs' })]),
    );
    render(<SuggestionsAside onProposer={vi.fn()} />);
    expect(await screen.findByText('Scénariste')).toBeInTheDocument();
    // no "role · genre" separator rendered when genre is null
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('links "Profil" to /{slug} with an accessible name', async () => {
    render(<SuggestionsAside onProposer={vi.fn()} />);
    const link = await screen.findByRole('link', { name: 'Profil de Léa B.' });
    expect(link).toHaveAttribute('href', '/mc1-lea-b');
  });

  it('fires onProposer with the suggestion when "Proposer" is clicked', async () => {
    const onProposer = vi.fn();
    const item = suggestion();
    getMatchSuggestions.mockResolvedValue(res([item]));
    render(<SuggestionsAside onProposer={onProposer} />);
    await screen.findByText('Léa B.');
    await userEvent.click(screen.getByRole('button', { name: 'Proposer une collaboration à Léa B.' }));
    expect(onProposer).toHaveBeenCalledWith(item);
  });

  it('shows a loading status region while fetching', async () => {
    let resolve: (v: MatchSuggestionsResponse) => void = () => {};
    getMatchSuggestions.mockReturnValue(new Promise<MatchSuggestionsResponse>((r) => (resolve = r)));
    render(<SuggestionsAside onProposer={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolve(res([suggestion()]));
    await screen.findByText('Léa B.');
  });

  it('shows the sparse-profile copy when incompleteProfile is true', async () => {
    getMatchSuggestions.mockResolvedValue(res([], true));
    render(<SuggestionsAside onProposer={vi.fn()} />);
    expect(
      await screen.findByText('Complétez votre profil pour recevoir des suggestions.'),
    ).toBeInTheDocument();
  });

  it('shows the generic empty copy when there are no suggestions but the profile is complete', async () => {
    getMatchSuggestions.mockResolvedValue(res([], false));
    render(<SuggestionsAside onProposer={vi.fn()} />);
    expect(await screen.findByText('Aucune suggestion pour le moment.')).toBeInTheDocument();
  });

  it('shows an error alert with a working "Réessayer" retry', async () => {
    getMatchSuggestions
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(res([suggestion()]));
    render(<SuggestionsAside onProposer={vi.fn()} />);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
  });
});
