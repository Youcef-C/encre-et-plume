import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn(),
  updateMyProfile: vi.fn().mockResolvedValue({}),
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

import { updateMyProfile } from '../lib/api';
import ProfileTags from '../components/ProfileTags';

const sampleTags = ['Seinen', 'Thriller', 'Encre dense'];

describe('ProfileTags — visitor mode', () => {
  it('renders tags as non-interactive spans', () => {
    render(<ProfileTags tags={sampleTags} isOwner={false} />);
    // Should NOT be buttons in visitor mode
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/seinen/i)).toBeInTheDocument();
  });

  it('renders each tag with ✓ suffix', () => {
    render(<ProfileTags tags={['Seinen']} isOwner={false} />);
    expect(screen.getByText('Seinen ✓')).toBeInTheDocument();
  });

  it('renders nothing when tags is empty (visitor)', () => {
    const { container } = render(<ProfileTags tags={[]} isOwner={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProfileTags — owner mode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders tags as filled accent chips, each with a "Retirer <tag>" remove button', () => {
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    expect(screen.getByText('Seinen')).toBeInTheDocument();
    for (const tag of sampleTags) {
      expect(screen.getByRole('button', { name: `Retirer ${tag}` })).toBeInTheDocument();
    }
    // No toggle semantics left — no aria-pressed anywhere.
    expect(screen.queryByRole('button', { name: 'Seinen' })).not.toBeInTheDocument();
  });

  it('renders "＋ Ajouter" button', () => {
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    expect(screen.getByRole('button', { name: /ajouter/i })).toBeInTheDocument();
  });

  it('clicking "Retirer <tag>" removes the chip and calls updateMyProfile with the remaining tags', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: 'Retirer Seinen' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retirer Seinen' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retirer Thriller' })).toBeInTheDocument();
    expect(vi.mocked(updateMyProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.not.arrayContaining(['Seinen']) })
    );
  });

  it('"Retirer <tag>" is keyboard-operable (Enter on a focused remove button removes the tag)', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    const removeBtn = screen.getByRole('button', { name: 'Retirer Seinen' });
    removeBtn.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retirer Seinen' })).not.toBeInTheDocument()
    );
  });

  it('clicking "＋ Ajouter" shows a vocabulary-backed suggestion input', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={[]} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(screen.getByRole('combobox', { name: /nouveau genre/i })).toBeInTheDocument();
  });

  it('typing a vocabulary genre (multi-word) and pressing Enter adds it', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    const input = screen.getByRole('combobox');
    await user.type(input, 'Dark Fantasy');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /dark fantasy/i })).toBeInTheDocument()
    );
    expect(vi.mocked(updateMyProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.arrayContaining(['Dark Fantasy']) })
    );
  });

  it('does not add a duplicate tag (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    const input = screen.getByRole('combobox');
    await user.type(input, 'seinen');
    await user.keyboard('{Enter}');
    // Only one button matching "seinen"
    const matches = screen.getAllByRole('button', { name: /seinen/i });
    expect(matches).toHaveLength(1);
  });

  it('does not add a non-vocabulary tag (free text rejected)', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={[]} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    const btnCountWithInputOpen = screen.queryAllByRole('button').length;
    const input = screen.getByRole('combobox');
    await user.type(input, 'Zzzz');
    await user.keyboard('{Enter}');
    // No new chip created; input stays open (rejected, not cancelled)
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryAllByRole('button').length).toBe(btnCountWithInputOpen);
    expect(vi.mocked(updateMyProfile)).not.toHaveBeenCalled();
  });

  it('does not add an empty tag (Escape cancels)', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={[]} isOwner={true} />);
    const initialBtnCount = screen.getAllByRole('button').length;
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    await user.keyboard('{Escape}');
    // Input disappeared (cancelled), no new tag button
    await waitFor(() =>
      expect(screen.getAllByRole('button').length).toBe(initialBtnCount)
    );
  });
});
