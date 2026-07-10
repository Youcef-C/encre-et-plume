import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectWorkspaceResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, updateProjectInfo: vi.fn() };
});
vi.mock('../components/UploadControl', () => ({
  default: ({ label, onUploaded }: { label: string; onUploaded: (m: { id: string }) => void }) => (
    <button type="button" onClick={() => onUploaded({ id: 'm1' })}>{label}</button>
  ),
}));

import * as api from '../lib/api';
import InfosPanel from '../components/projet/InfosPanel';

function makeWorkspace(over: Partial<ProjectWorkspaceResponse> = {}): ProjectWorkspaceResponse {
  return {
    id: 'p1', slug: 'nuit-blanche', workSlug: 'nuit-blanche', title: 'Nuit Blanche',
    synopsis: 'Un synopsis.', hashtags: ['seinen'], collabOpen: false, visibility: 'public', cover: null,
    members: [], chapters: [], pages: [],
    reviews: { summary: { overall: 0, story: 0, art: 0, count: 0 }, items: [] },
    viewer: { isMember: true, isOwner: true }, ...over,
  };
}

function setup(over: Partial<ProjectWorkspaceResponse> = {}) {
  const user = userEvent.setup();
  render(<InfosPanel slug="nuit-blanche" workspace={makeWorkspace(over)} />);
  return user;
}

const mockUpdate = () => api.updateProjectInfo as ReturnType<typeof vi.fn>;
const lastCall = () => mockUpdate().mock.calls.at(-1)?.[1];

describe('InfosPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate().mockResolvedValue({ title: 'Nuit Blanche!', synopsis: '', hashtags: [], collabOpen: false, cover: null });
  });

  it('debounces a title edit into one PATCH and shows "Enregistré ✓"', async () => {
    const user = setup();
    await user.type(screen.getByLabelText('TITRE'), '!');
    await waitFor(() => expect(api.updateProjectInfo).toHaveBeenCalledTimes(1));
    expect(mockUpdate().mock.calls[0][1]).toEqual({ title: 'Nuit Blanche!' });
    expect(await screen.findByText('Enregistré ✓')).toBeInTheDocument();
  });

  it('blocks the save and shows an alert when the title is emptied', async () => {
    const user = setup();
    await user.clear(screen.getByLabelText('TITRE'));
    expect(screen.getByRole('alert')).toHaveTextContent('Un titre est requis');
    // No timer was scheduled → still no call after the debounce window.
    await new Promise((r) => setTimeout(r, 700));
    expect(api.updateProjectInfo).not.toHaveBeenCalled();
  });

  it('parses space-separated hashtags into chips and sends an array', async () => {
    const user = setup({ hashtags: [] });
    await user.type(screen.getByLabelText(/HASHTAGS/), '#Shonen aventure');
    await waitFor(() => expect(api.updateProjectInfo).toHaveBeenCalled());
    expect(lastCall()).toEqual({ hashtags: ['shonen', 'aventure'] });
    expect(screen.getByText('#shonen')).toBeInTheDocument();
    expect(screen.getByText('#aventure')).toBeInTheDocument();
  });

  it('toggles collaboration Ouvertes/Fermées and saves collabOpen', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Fermées' }));
    expect(screen.getByRole('button', { name: 'Ouvertes' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(api.updateProjectInfo).toHaveBeenCalled());
    expect(lastCall()).toEqual({ collabOpen: true });
  });

  it('saves a cover mediaId when the upload succeeds', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Déposez la couverture' }));
    await waitFor(() => expect(api.updateProjectInfo).toHaveBeenCalled());
    expect(lastCall()).toEqual({ cover: { mediaId: 'm1' } });
  });

  it('clears the cover via "Retirer la couverture"', async () => {
    const user = setup({ cover: 'https://cdn/x.jpg' });
    await user.click(screen.getByRole('button', { name: 'Retirer la couverture' }));
    await waitFor(() => expect(api.updateProjectInfo).toHaveBeenCalled());
    expect(lastCall()).toEqual({ cover: null });
  });

  it('renders the reviews summary and a moderation-hidden row read-only', () => {
    setup({
      reviews: {
        summary: { overall: 4.5, story: 4, art: 5, count: 2 },
        items: [
          { id: 'r1', authorName: 'Inès', storyRating: 4, artRating: 5, text: 'Superbe.', hidden: false, createdAt: '2026-07-01' },
          { id: 'r2', authorName: 'Léa', storyRating: 0, artRating: 0, text: '', hidden: true, createdAt: '2026-07-02' },
        ],
      },
    });
    expect(screen.getByText('2 avis · lecture seule')).toBeInTheDocument();
    expect(screen.getByText('Superbe.')).toBeInTheDocument();
    expect(screen.getByText(/masqué par la modération/)).toBeInTheDocument();
  });

  it('shows the empty-reviews state', () => {
    setup();
    expect(screen.getByText('Aucun avis pour le moment.')).toBeInTheDocument();
  });
});
