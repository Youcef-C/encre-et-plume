import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectWorkspaceResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, createPage: vi.fn(), updatePageStage: vi.fn(), deletePage: vi.fn(), updateProjectInfo: vi.fn(), getMyProjects: vi.fn() };
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
    chapters: [{ id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0 }],
    pages: [],
    labels: [],
    reviews: { summary: { overall: 0, story: 0, art: 0, count: 0 }, items: [] },
    viewer: { isMember: true, isOwner: true },
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
    expect(screen.getByRole('button', { name: 'Publier' })).toBeInTheDocument();
  });

  // Batch — the header "Éditeur" button opens the collaborative editor: the last card opened for this
  // project (localStorage) if it's still on the board, else the first board card. (Rendered on the
  // INFOS tab so the KanbanBoard isn't mounted — the header buttons show regardless of active tab.)
  const pg = (id: string) =>
    ({ id, chapterId: null, title: id, stage: 'todo', fileTags: [], linkedFileIds: [], linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0 }) as unknown as ProjectWorkspaceResponse['pages'][number];

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

  it('renders the Chapitres placeholder copy', () => {
    renderWs('chapitres');
    expect(screen.getByText('La gestion des chapitres arrive bientôt.')).toBeInTheDocument();
  });

  it('hides action buttons for a non-member public viewer', () => {
    renderWs('tableau', { viewer: { isMember: false, isOwner: false } });
    expect(screen.queryByRole('button', { name: 'Gérer le groupe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publier' })).not.toBeInTheDocument();
  });
});
