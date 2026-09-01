import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  WorkspaceChapter,
  WorkspacePage,
  PageDetailResponse,
  AssetItem,
  AssetListResponse,
  WorkspaceMember,
} from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePageStage: vi.fn(),
    createProjectLabel: vi.fn(),
    deleteProjectLabel: vi.fn(),
    getPageDetail: vi.fn(),
    listProjectAssets: vi.fn(),
    getAssetVersions: vi.fn(),
    getAssetPreview: vi.fn(),
    linkAssetToPage: vi.fn(),
    unlinkAssetFromPage: vi.fn(),
    updatePage: vi.fn(),
  };
});

import * as api from '../lib/api';
import KanbanBoard from '../components/projet/KanbanBoard';
import CardModal from '../components/projet/CardModal';

const chapters: WorkspaceChapter[] = [{ id: 'c1', number: 1, title: 'La rencontre', status: 'draft', plancheCount: 1, targetPages: 20, progressPct: 0 }];

function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg7', chapterId: 'c1', title: 'Page 7', stage: 'scenario', position: 0, fileTags: [], linkedFileIds: [],
    linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, openCorrectionCount: 0, openCorrectionTypes: [], createdById: null, handoff: null, scenarioUnsaved: false, ...over,
  };
}

const members: WorkspaceMember[] = [{ accountId: 'me', displayName: 'Yuki', avatar: null, roles: ['scenariste'] }];

function pageDetail(over: Partial<PageDetailResponse> = {}): PageDetailResponse {
  return {
    id: 'pg7', chapterId: 'c1', title: 'Page 7', stage: 'scenario', position: 0, fileTags: [], linkedFileIds: [], linkedFiles: [],
    dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, openCorrectionCount: 0, openCorrectionTypes: [], createdById: null, handoff: null, scenarioUnsaved: false,
    description: '', checklist: [], comments: [], ...over,
  };
}
function scenarioAsset(over: Partial<AssetItem> = {}): AssetItem {
  return {
    id: 'a1', type: 'scenario', filename: 'scenario-ch5.txt', currentVersion: 2, size: 100, thumbnailUrl: null,
    previewable: true, linkedPages: [{ id: 'pg7', title: 'Page 7' }], updatedAt: '2026-07-10T10:00:00.000Z', ...over,
  };
}
function assetList(items: AssetItem[]): AssetListResponse {
  return { items, total: items.length, page: 1, pageSize: 24, totalPages: 1 };
}

describe('CS-4 editor entry points', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList([]));
  });

  it('kanban ✎ pen icon links to the editor for that card', () => {
    render(<KanbanBoard slug="lames-de-brume" chapters={chapters} initialPages={[makePage({})]} members={members} />);
    const pen = screen.getByRole('link', { name: 'Éditer le scénario' });
    expect(pen).toHaveAttribute('href', '/projet/lames-de-brume/editeur/pg7');
  });

  it('card modal shows "Éditer" on a linked scenario file', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(
      pageDetail({ linkedFiles: [{ assetId: 'a1', type: 'scenario', filename: 'scenario-ch5.txt', version: 2 }] }),
    );
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList([scenarioAsset()]));
    render(
      <CardModal pageId="pg7" slug="lames-de-brume" members={members} labels={[]} viewerId="me" isOwner={false}
        onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    const edit = await screen.findByRole('link', { name: 'Éditer scenario-ch5.txt' });
    expect(edit).toHaveAttribute('href', '/projet/lames-de-brume/editeur/pg7?asset=a1');
  });

  it('card modal shows "＋ Nouveau scénario" when the Scénario section is empty', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(pageDetail());
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList([]));
    render(
      <CardModal pageId="pg7" slug="lames-de-brume" members={members} labels={[]} viewerId="me" isOwner={false}
        onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    const create = await screen.findByRole('link', { name: 'Créer un nouveau scénario' });
    expect(create).toHaveAttribute('href', '/projet/lames-de-brume/editeur/pg7');
  });
});
