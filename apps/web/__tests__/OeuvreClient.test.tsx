import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkDetail, WorkChaptersResponse, PlancheDto } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getWork: vi.fn(),
    getWorkChapters: vi.fn(),
    getWorkPlanches: vi.fn(),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('../lib/session', () => ({ useSession: () => ({ account: null, loading: false }) }));

import * as api from '../lib/api';
import OeuvreClient from '../components/oeuvre/OeuvreClient';

const work: WorkDetail = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
  themes: [],
  format: 'Manga',
  complete: true,
  audienceRating: '16+',
  meta: 'Camille R. × Yuki M. · 20 ch.',
  publishedAt: '2024-03-14T00:00:00.000Z',
  synopsis: 'Une histoire.',
  hashtags: ['fantasy'],
  proseExcerpt: null,
  likeCount: 3400,
  readCount: 128000,
  favoriteCount: 340,
  ratingAvg: 4.5,
  ratingStoryAvg: 4.5,
  ratingArtAvg: 4.5,
  reviewCount: 2,
  chapterCount: 12,
  team: [{ id: 'c1', name: 'Camille Roux', slug: 'camille-roux', role: 'scenariste', city: 'Lyon', avatar: null }],
  fundingGoals: [],
  reviews: [],
  collectionItems: null,
};

const chapters: WorkChaptersResponse = {
  items: [{ id: 'ch-1', number: 1, title: 'Sous la pluie', plancheCount: 22, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 1800, locked: false, lockReason: null }],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const planches: PlancheDto[] = [];

function mockReady() {
  vi.mocked(api.getWork).mockResolvedValue(work);
  vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
  vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
}

describe('OeuvreClient (DR-3 FE-1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading skeleton, then the ready page', async () => {
    mockReady();
    render(<OeuvreClient slug="lames-de-brume" />);
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument());
    expect(screen.getByText('ÉQUIPE CRÉATIVE')).toBeInTheDocument();
  });

  it('renders Partager/Signaler above the ÉQUIPE CRÉATIVE box (DR-3 2026-07-09)', async () => {
    mockReady();
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument());
    const partager = screen.getByRole('button', { name: /Partager/ });
    expect(screen.getByRole('button', { name: /Signaler/ })).toBeInTheDocument();
    const team = screen.getByText('ÉQUIPE CRÉATIVE');
    expect(partager.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a 404 view for an unknown slug', async () => {
    vi.mocked(api.getWork).mockRejectedValue({ statusCode: 404, message: 'Œuvre introuvable' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    render(<OeuvreClient slug="inconnu-xyz" />);
    await waitFor(() => expect(screen.getByText('Œuvre introuvable')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Catalogue/i })).toHaveAttribute('href', '/decouvrir');
  });

  it('shows an error state with a working retry', async () => {
    vi.mocked(api.getWork).mockRejectedValueOnce({ statusCode: 500, message: 'Erreur serveur' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    const user = userEvent.setup();
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getWork).mockResolvedValueOnce(work);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument());
  });

  // ── DR-10: 18+ age gate ───────────────────────────────────────────────────────

  it('shows the AgeGate interstitial over an 18+ work when the viewer is not cleared', async () => {
    sessionStorage.clear();
    vi.mocked(api.getWork).mockResolvedValue({ ...work, audienceRating: '18+' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeInTheDocument());
  });

  // Presentation update (user-specified 2026-07-05): the interstitial now shows the page BLURRED
  // behind it instead of a flat backdrop, so the real content is present in the DOM again (it just
  // isn't reachable/announced) — superseding the earlier "content never mounts" regression test.
  it('renders the work content behind the gate, blurred + aria-hidden + non-interactive (not absent)', async () => {
    sessionStorage.clear();
    vi.mocked(api.getWork).mockResolvedValue({ ...work, audienceRating: '18+' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeInTheDocument());

    // Present in the DOM...
    const heading = screen.getByText('Lames de Brume', { selector: 'h1' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Camille Roux')).toBeInTheDocument();
    // ...but hidden from the accessibility tree (role queries filter aria-hidden subtrees)...
    expect(screen.queryByRole('heading', { level: 1, name: 'Lames de Brume' })).not.toBeInTheDocument();
    // ...wrapped in a blurred, non-interactive, aria-hidden container.
    const wrapper = heading.closest('[aria-hidden="true"]') as HTMLElement | null;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper!.style.filter).toContain('blur');
    expect(wrapper!.style.pointerEvents).toBe('none');
    expect(wrapper!.style.userSelect).toBe('none');
  });

  it('does not show the AgeGate for a non-18+ work', async () => {
    mockReady();
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the AgeGate once the viewer has already self-declared this session', async () => {
    sessionStorage.setItem('ep_age_cleared', '1');
    vi.mocked(api.getWork).mockResolvedValue({ ...work, audienceRating: '18+' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lames de Brume' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    sessionStorage.clear();
  });

  it('shows a refusal (not the generic error state, no retry) on a 403 AGE_RESTRICTED response', async () => {
    vi.mocked(api.getWork).mockRejectedValue({
      statusCode: 403,
      message: 'Ce contenu est réservé aux adultes.',
      error: 'AGE_RESTRICTED',
    });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chapters);
    vi.mocked(api.getWorkPlanches).mockResolvedValue(planches);
    render(<OeuvreClient slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText('Ce contenu est réservé aux adultes.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });
});
