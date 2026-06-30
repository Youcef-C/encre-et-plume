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

  it('renders tags as toggle buttons with aria-pressed', () => {
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    const buttons = screen.getAllByRole('button');
    // At minimum sampleTags.length + 1 (the ＋ Ajouter button)
    expect(buttons.length).toBeGreaterThanOrEqual(sampleTags.length);
    const seinenBtn = screen.getByRole('button', { name: /seinen/i });
    expect(seinenBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders "＋ Ajouter" button', () => {
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    expect(screen.getByRole('button', { name: /ajouter/i })).toBeInTheDocument();
  });

  it('clicking a selected tag deselects it and calls updateMyProfile', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={sampleTags} isOwner={true} />);
    const seinenBtn = screen.getByRole('button', { name: /seinen/i });
    expect(seinenBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(seinenBtn);
    await waitFor(() => expect(seinenBtn).toHaveAttribute('aria-pressed', 'false'));
    expect(vi.mocked(updateMyProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.not.arrayContaining(['Seinen']) })
    );
  });

  it('keyboard Enter toggles a tag', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    const btn = screen.getByRole('button', { name: /seinen/i });
    btn.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
  });

  it('clicking "＋ Ajouter" shows an input', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={[]} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('typing a new tag and pressing Enter adds it', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    const input = screen.getByRole('textbox');
    await user.type(input, 'Shōnen');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: /shōnen/i })).toBeInTheDocument());
  });

  it('does not add a duplicate tag (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={['Seinen']} isOwner={true} />);
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    const input = screen.getByRole('textbox');
    await user.type(input, 'seinen');
    await user.keyboard('{Enter}');
    // Only one button matching "seinen"
    const matches = screen.getAllByRole('button', { name: /seinen/i });
    expect(matches).toHaveLength(1);
  });

  it('does not add an empty tag', async () => {
    const user = userEvent.setup();
    render(<ProfileTags tags={[]} isOwner={true} />);
    const initialBtnCount = screen.getAllByRole('button').length;
    await user.click(screen.getByRole('button', { name: /ajouter/i }));
    await user.keyboard('{Enter}');
    // Input disappeared (cancelled), no new tag button
    await waitFor(() =>
      expect(screen.getAllByRole('button').length).toBe(initialBtnCount)
    );
  });
});
