import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectWorkspaceResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getPageVersions: vi.fn(), createPage: vi.fn(), updatePageStage: vi.fn(), deletePage: vi.fn(), updateProjectInfo: vi.fn() };
});
vi.mock('../components/UploadControl', () => ({ default: ({ label }: { label: string }) => <div>{label}</div> }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

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
      { accountId: 'u1', displayName: 'Camille', avatar: null, role: 'scenariste' },
      { accountId: 'u2', displayName: 'Yuki', avatar: null, role: 'dessinateur' },
    ],
    chapters: [{ id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0 }],
    pages: [],
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
    expect(screen.getByText('Camille')).toBeInTheDocument();
    expect(screen.getByText('Yuki')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gérer le groupe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Éditeur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publier' })).toBeInTheDocument();
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
