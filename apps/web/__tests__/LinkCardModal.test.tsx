import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetItem, WorkspacePage } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  linkAssetToPage: vi.fn(),
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
  linkedPage: null,
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const pages = [
  makePage({ id: 'pg7', title: 'Page 7', stage: 'scenario' }),
  makePage({ id: 'pg6', title: 'Page 6', stage: 'nemu' }),
];

describe('LinkCardModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists project cards and links the chosen one', async () => {
    const linked: AssetItem = { ...asset, linkedPage: { id: 'pg7', title: 'Page 7' } };
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
