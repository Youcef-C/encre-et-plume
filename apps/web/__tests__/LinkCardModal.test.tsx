import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetItem, WorkspacePage } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  linkAssetToPage: vi.fn(),
  unlinkAssetFromPage: vi.fn(),
}));

import * as api from '../lib/api';
import LinkCardModal from '../components/projet/LinkCardModal';

function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg',
    chapterId: 'c1',
    title: 'Page',
    stage: 'scenario',
    fileTags: [],
    linkedFileIds: [],
    linkedFiles: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    createdById: null,
    ...over,
  };
}

const asset: AssetItem = {
  id: 'a1',
  type: 'dessin',
  filename: 'ruelle-nemu.png',
  currentVersion: 1,
  size: 2_400_000,
  thumbnailUrl: null,
  previewable: true,
  linkedPages: [],
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const pages = [
  makePage({ id: 'pg7', title: 'Page 7', stage: 'scenario' }),
  makePage({ id: 'pg6', title: 'Page 6', stage: 'nemu' }),
];

describe('LinkCardModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists project cards and links the chosen one', async () => {
    const linked: AssetItem = { ...asset, linkedPages: [{ id: 'pg7', title: 'Page 7' }] };
    vi.mocked(api.linkAssetToPage).mockResolvedValue(linked);
    const onLinked = vi.fn();
    render(
      <LinkCardModal asset={asset} pages={pages} onClose={vi.fn()} onLinked={onLinked} />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Page 7')).toBeInTheDocument();
    expect(screen.getByText('Page 6')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Page 7/ }));

    await waitFor(() =>
      expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' }),
    );
    expect(onLinked).toHaveBeenCalledWith(linked);
  });

  it('toggles a card: click links (stays open, row selected), click again unlinks', async () => {
    // scenario = MULTI type, so cards toggle freely.
    const scenario: AssetItem = { ...asset, type: 'scenario', linkedPages: [] };
    const linked: AssetItem = { ...scenario, linkedPages: [{ id: 'pg7', title: 'Page 7' }] };
    vi.mocked(api.linkAssetToPage).mockResolvedValue(linked);
    vi.mocked(api.unlinkAssetFromPage).mockResolvedValue(scenario);
    const onClose = vi.fn();
    const onLinked = vi.fn();
    render(
      <LinkCardModal asset={scenario} pages={pages} onClose={onClose} onLinked={onLinked} />,
    );

    const row = () => screen.getByRole('button', { name: /Page 7/ });
    expect(row()).toHaveAttribute('aria-pressed', 'false');

    // Click links it — modal stays open, row becomes selected, grid gets the update.
    await userEvent.click(row());
    await waitFor(() => expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' }));
    expect(onLinked).toHaveBeenCalledWith(linked);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(row()).toHaveAttribute('aria-pressed', 'true'));

    // Click again unlinks it — row becomes unselected again.
    await userEvent.click(row());
    await waitFor(() => expect(api.unlinkAssetFromPage).toHaveBeenCalledWith('a1', 'pg7'));
    expect(onLinked).toHaveBeenLastCalledWith(scenario);
    await waitFor(() => expect(row()).toHaveAttribute('aria-pressed', 'false'));
  });

  it('multi type: several cards can be toggled on', async () => {
    const scenario: AssetItem = { ...asset, type: 'scenario', linkedPages: [] };
    vi.mocked(api.linkAssetToPage)
      .mockResolvedValueOnce({ ...scenario, linkedPages: [{ id: 'pg7', title: 'Page 7' }] })
      .mockResolvedValueOnce({
        ...scenario,
        linkedPages: [
          { id: 'pg7', title: 'Page 7' },
          { id: 'pg6', title: 'Page 6' },
        ],
      });
    render(<LinkCardModal asset={scenario} pages={pages} onClose={vi.fn()} onLinked={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Page 7/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Page 7/ })).toHaveAttribute('aria-pressed', 'true'),
    );
    await userEvent.click(screen.getByRole('button', { name: /Page 6/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Page 6/ })).toHaveAttribute('aria-pressed', 'true'),
    );
    // Both stay selected for a MULTI type.
    expect(screen.getByRole('button', { name: /Page 7/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes via the Terminé button', async () => {
    const onClose = vi.fn();
    render(<LinkCardModal asset={asset} pages={pages} onClose={onClose} onLinked={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<LinkCardModal asset={asset} pages={pages} onClose={onClose} onLinked={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty note when the project has no cards', () => {
    render(<LinkCardModal asset={asset} pages={[]} onClose={vi.fn()} onLinked={vi.fn()} />);
    expect(screen.getByText('Aucune carte dans ce projet.')).toBeInTheDocument();
  });
});
