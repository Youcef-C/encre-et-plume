import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectWorkspaceResponse, WorkspacePage } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createPage: vi.fn(),
    updatePageStage: vi.fn(),
    deletePage: vi.fn(),
    getProjectWorkspace: vi.fn(),
    updateProjectInfo: vi.fn(),
    getMyProjects: vi.fn(),
    // CS-7: the Chapitres tab now renders the real panel, which fetches on mount.
    getProjectChapters: vi.fn().mockResolvedValue({ chapters: [], canWrite: true }),
  };
});
vi.mock('../components/UploadControl', () => ({ default: ({ label }: { label: string }) => <div>{label}</div> }));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import * as api from '../lib/api';
import ProjectWorkspace, { type WorkspaceTab } from '../components/projet/ProjectWorkspace';

function makeWorkspace(over: Partial<ProjectWorkspaceResponse> = {}): ProjectWorkspaceResponse {
  return {
    id: 'p1',
    slug: 'nuit-blanche',
    workSlug: 'nuit-blanche',
    title: 'Nuit Blanche',
    synopsis: 'Un synopsis.',
    hashtags: ['seinen', 'action'],
    collabOpen: false,
    visibility: 'public',
    cover: null,
    members: [
      { accountId: 'u1', displayName: 'Camille', avatar: null, roles: ['scenariste', 'dessinateur'] },
      { accountId: 'u2', displayName: 'Yuki', avatar: null, roles: ['dessinateur'] },
    ],
    chapters: [{ id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 }],
    pages: [],
    labels: [],
    reviews: { summary: { overall: 0, story: 0, art: 0, count: 0 }, items: [] },
    viewer: { isMember: true, isOwner: true, canWrite: true, canManage: true },
    ...over,
  };
}

function renderWs(tab: WorkspaceTab = 'tableau', over: Partial<ProjectWorkspaceResponse> = {}, onTabChange = vi.fn()) {
  render(<ProjectWorkspace slug="nuit-blanche" workspace={makeWorkspace(over)} tab={tab} onTabChange={onTabChange} />);
  return onTabChange;
}

describe('ProjectWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the header replica: back link, title, member names, action buttons', () => {
    renderWs();
    const back = screen.getByRole('link', { name: /Projets/ });
    expect(back).toHaveAttribute('href', '/projets');
    expect(screen.getByText('Nuit Blanche')).toBeInTheDocument();
    // Member names show in the header (span); the assignee-filter chips also carry them, so scope
    // the assertion to the header span rendering.
    expect(screen.getByText('Camille', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Yuki', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gérer le groupe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Éditeur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réorganiser & Publier' })).toBeInTheDocument();
  });

  // CS-6 — the header's « Réorganiser & Publier ▾ » is the entry point to « Réorganiser les pages »
  // (proto 1303 `goArrangement`). It was inert until this story gave it a destination.
  it('“Réorganiser & Publier ▾” navigates to /projet/{slug}/arrangement', async () => {
    renderWs();
    await userEvent.click(screen.getByRole('button', { name: 'Réorganiser & Publier' }));
    expect(push).toHaveBeenCalledWith('/projet/nuit-blanche/arrangement');
  });

  // CS-10 — the header button opens the "Gérer le groupe" surface.
  it('“Gérer le groupe” navigates to /projet/{slug}/groupe', async () => {
    renderWs();
    await userEvent.click(screen.getByRole('button', { name: 'Gérer le groupe' }));
    expect(push).toHaveBeenCalledWith('/projet/nuit-blanche/groupe');
  });

  // Batch — the header "Éditeur" button opens the collaborative editor: the last card opened for this
  // project (localStorage) if it's still on the board, else the first board card. (Rendered on the
  // INFOS tab so the KanbanBoard isn't mounted — the header buttons show regardless of active tab.)
  const pg = (id: string) =>
    ({ id, chapterId: 'c1', title: id, stage: 'todo', fileTags: [], linkedFileIds: [], linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, createdById: null }) as unknown as ProjectWorkspaceResponse['pages'][number];

  it('“Éditeur” navigates to the first board card when nothing was opened before', async () => {
    localStorage.clear();
    renderWs('infos', { pages: [pg('pg1'), pg('pg2')] });
    await userEvent.click(screen.getByRole('button', { name: 'Éditeur' }));
    expect(push).toHaveBeenCalledWith('/projet/nuit-blanche/editeur/pg1');
  });

  it('“Éditeur” reopens the last-opened card when it is still on the board', async () => {
    localStorage.setItem('ep:lastEditor:nuit-blanche', 'pg2');
    renderWs('infos', { pages: [pg('pg1'), pg('pg2')] });
    await userEvent.click(screen.getByRole('button', { name: 'Éditeur' }));
    expect(push).toHaveBeenCalledWith('/projet/nuit-blanche/editeur/pg2');
    localStorage.clear();
  });

  it('“Éditeur” falls back to the first card when the stored id is no longer on the board', async () => {
    localStorage.setItem('ep:lastEditor:nuit-blanche', 'gone');
    renderWs('infos', { pages: [pg('pg1'), pg('pg2')] });
    await userEvent.click(screen.getByRole('button', { name: 'Éditeur' }));
    expect(push).toHaveBeenCalledWith('/projet/nuit-blanche/editeur/pg1');
    localStorage.clear();
  });

  it('renders one icon per active profile role (both for a dual-role member, one otherwise)', () => {
    renderWs();
    const camille = screen.getByText('Camille', { selector: 'span' }).parentElement!;
    const yuki = screen.getByText('Yuki', { selector: 'span' }).parentElement!;
    expect(camille.querySelectorAll('svg')).toHaveLength(2);
    expect(yuki.querySelectorAll('svg')).toHaveLength(1);
  });

  it('opens the project switcher and lists the viewer’s other manga/roman projects (illustrations excluded)', async () => {
    (api.getMyProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: 'p1', title: 'Nuit Blanche', slug: 'nuit-blanche', type: 'Manga', kind: 'project' },
        { id: 'p2', title: 'Autre Roman', slug: 'autre-roman', type: 'Histoire', kind: 'project' },
        { id: 'c1', title: 'Ma Collection', slug: 'ma-collection', type: 'Illustration(s)', kind: 'illustration' },
      ],
    });
    renderWs();
    await userEvent.click(screen.getByRole('button', { name: 'Changer de projet' }));
    expect(api.getMyProjects).toHaveBeenCalled();
    const link = await screen.findByRole('menuitem', { name: /Autre Roman/ });
    expect(link).toHaveAttribute('href', '/projet/autre-roman');
    expect(screen.queryByText('Ma Collection')).not.toBeInTheDocument();
  });

  it('renders 6 tabs as an ARIA tablist with the active tab selected', () => {
    renderWs('tableau');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);
    expect(tabs.map((t) => t.textContent)).toEqual(['Tableau', 'Chapitres', 'Fichiers', 'Discussion', 'Soutien', 'Infos']);
    expect(screen.getByRole('tab', { name: 'Tableau' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Infos' })).toHaveAttribute('aria-selected', 'false');
  });

  it('fires onTabChange when a tab is clicked', async () => {
    const onTabChange = renderWs('tableau');
    await userEvent.click(screen.getByRole('tab', { name: 'Infos' }));
    expect(onTabChange).toHaveBeenCalledWith('infos');
  });

  it('moves selection with ArrowRight (roving tabindex)', async () => {
    const onTabChange = renderWs('tableau');
    screen.getByRole('tab', { name: 'Tableau' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onTabChange).toHaveBeenCalledWith('chapitres');
  });

  it('deep-links to the INFOS panel when tab="infos"', () => {
    renderWs('infos');
    expect(screen.getByText('Informations du projet')).toBeInTheDocument();
  });

  // CS-7 replaced the placeholder with the real Chapitres panel (its own suite covers the behaviour).
  it('renders the Chapitres panel', async () => {
    renderWs('chapitres');
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    expect(await screen.findByText('Aucun chapitre pour le moment')).toBeInTheDocument();
  });

  it('hides action buttons for a non-member public viewer', () => {
    renderWs('tableau', { viewer: { isMember: false, isOwner: false, canWrite: false, canManage: false } });
    expect(screen.queryByRole('button', { name: 'Gérer le groupe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réorganiser & Publier' })).not.toBeInTheDocument();
  });

  // CS-10 B-4 — the asset write routes are « Écriture »-gated server-side; the Fichiers panel must
  // mirror that rather than offering actions that 403. Defence in depth, never the only gate.
  it('hides the Fichiers import affordance from a member without « Écriture »', () => {
    renderWs('fichiers', { viewer: { isMember: true, isOwner: false, canWrite: false, canManage: false } });
    expect(screen.queryByRole('button', { name: /Importer/ })).not.toBeInTheDocument();
  });

  it('offers it to a member who holds « Écriture »', () => {
    renderWs('fichiers', { viewer: { isMember: true, isOwner: false, canWrite: true, canManage: false } });
    expect(screen.getByRole('button', { name: /Importer/ })).toBeInTheDocument();
  });

  // CS-10 D-2 — card create/edit/move are « Écriture »-gated server-side (`loadWritablePage` /
  // `resolveWritableProject`). The board must mirror it instead of dead-ending on a 403.
  it('gives a member without « Écriture » a read-only board', () => {
    renderWs('tableau', { viewer: { isMember: true, isOwner: false, canWrite: false, canManage: false } });
    expect(screen.queryByRole('button', { name: '＋ Ajouter une carte' })).not.toBeInTheDocument();
  });

  it('offers the board write affordances to a member who holds « Écriture »', () => {
    renderWs('tableau', { viewer: { isMember: true, isOwner: false, canWrite: true, canManage: false } });
    expect(screen.getAllByRole('button', { name: '＋ Ajouter une carte' }).length).toBe(6);
  });

  // The INFOS PATCH is « Écriture »-gated too (inferred extension, recorded in backend-notes.md).
  it('makes the INFOS panel read-only for a member without « Écriture »', () => {
    renderWs('infos', { viewer: { isMember: true, isOwner: false, canWrite: false, canManage: false } });
    expect(screen.getByLabelText('TITRE')).toHaveAttribute('readonly');
  });

  // ── R4-1 · a card must survive a round trip through another tab ──────────────────────────────
  // The blocking bug the Reviewer failed CS-7 on: the board is rendered conditionally, so leaving
  // the Tableau UNMOUNTS it and coming back re-seeds `pages` from `workspace.pages` — a snapshot
  // fetched once. Card mutations only touched the board's local state, so a freshly created card
  // vanished. Three green suites missed it because they never crossed the tab boundary: this test
  // does, which is the only shape of test that can catch it.
  describe('workspace staleness across tabs (R4-1)', () => {
    const boardPage = (over: Partial<WorkspacePage>): WorkspacePage =>
      ({
        id: 'pg1',
        chapterId: 'c1',
        title: 'Page 1',
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
      }) as WorkspacePage;

    /** The real `ProjectWorkspaceClient` wiring: `onWorkspaceStale` refetches the payload in place. */
    function StaleHarness({ initial }: { initial: ProjectWorkspaceResponse }) {
      const [workspace, setWorkspace] = useState(initial);
      const [tab, setTab] = useState<WorkspaceTab>('tableau');
      return (
        <ProjectWorkspace
          slug="nuit-blanche"
          workspace={workspace}
          tab={tab}
          onTabChange={setTab}
          onWorkspaceStale={() => {
            void api.getProjectWorkspace('nuit-blanche').then(setWorkspace);
          }}
        />
      );
    }

    async function switchTab(name: string) {
      await userEvent.click(screen.getByRole('tab', { name }));
    }

    it('keeps a newly created card after leaving and returning to the Tableau', async () => {
      const created = boardPage({ id: 'new1', title: 'Page 1' });
      (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      (api.getProjectWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkspace({ pages: [created] }),
      );

      render(<StaleHarness initial={makeWorkspace({ pages: [] })} />);
      await userEvent.click(screen.getAllByRole('button', { name: '＋ Ajouter une carte' })[0]);
      expect(await screen.findByText('Page 1')).toBeInTheDocument();
      await waitFor(() => expect(api.getProjectWorkspace).toHaveBeenCalled());

      await switchTab('Chapitres');
      await switchTab('Tableau');

      // The card the user just created — same title, still on the board.
      expect(screen.getByText('Page 1')).toBeInTheDocument();
    });

    it('keeps a deleted card gone after leaving and returning to the Tableau', async () => {
      const existing = boardPage({ id: 'pg1', title: 'Page 1' });
      (api.deletePage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (api.getProjectWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkspace({ pages: [] }),
      );

      render(<StaleHarness initial={makeWorkspace({ pages: [existing] })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer la carte' }));
      await userEvent.click(
        (await screen.findAllByRole('button', { name: 'Supprimer' })).slice(-1)[0],
      );
      await waitFor(() => expect(screen.queryByText('Page 1')).not.toBeInTheDocument());

      await switchTab('Chapitres');
      await switchTab('Tableau');

      expect(screen.queryByText('Page 1')).not.toBeInTheDocument();
    });

    it('keeps a stage change after leaving and returning to the Tableau', async () => {
      const existing = boardPage({ id: 'pg1', title: 'Page 1' });
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...existing,
        stage: 'nemu',
      });
      (api.getProjectWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkspace({ pages: [{ ...existing, stage: 'nemu' }] }),
      );

      render(<StaleHarness initial={makeWorkspace({ pages: [existing] })} />);
      // R5-3: the stage move lives in the ⋯ menu's « Déplacer vers une colonne » submenu now.
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Nemu' }));
      await waitFor(() => expect(api.getProjectWorkspace).toHaveBeenCalled());

      await switchTab('Chapitres');
      await switchTab('Tableau');

      const nemu = screen.getByRole('group', { name: /Nemu/i });
      expect(nemu).toHaveTextContent('Page 1');
    });
  });
});
