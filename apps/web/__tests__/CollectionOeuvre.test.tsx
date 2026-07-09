// DR-12 V3 — Œuvre "Collection" variant. Badge "Collection", meta line, "Voir la galerie" CTA into
// the filtered Galerie, an ordered member grid linking to each illustration (with alt text), no
// chapter list, an empty state, and an owner-only "Gérer la collection" link.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, WorkDetail } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getReactionState: vi.fn(),
    likeReaction: vi.fn(),
    unlikeReaction: vi.fn(),
    saveReaction: vi.fn(),
    unsaveReaction: vi.fn(),
  };
});

import * as api from '../lib/api';
import CollectionOeuvre from '../components/oeuvre/CollectionOeuvre';

const owner: AccountSummary = {
  id: 'acc-yuki',
  displayName: 'Yuki Moreau',
  email: 'y@x.fr',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

function makeWork(overrides: Partial<WorkDetail> = {}): WorkDetail {
  return {
    id: 'w-carnet',
    slug: 'carnet-d-encre',
    title: "Carnet d'Encre",
    cover: null,
    genre: 'Art',
    themes: [],
    format: 'Illustration(s)',
    complete: false,
    audienceRating: 'Tous publics',
    meta: '2 illustrations · collection',
    publishedAt: '2026-01-01T00:00:00.000Z',
    synopsis: 'Recueil de planches.',
    hashtags: [],
    proseExcerpt: null,
    likeCount: 0,
    readCount: 0,
    favoriteCount: 0,
    ratingAvg: 0,
    ratingStoryAvg: 0,
    ratingArtAvg: 0,
    reviewCount: 0,
    chapterCount: 0,
    team: [{ id: 'acc-yuki', name: 'Yuki Moreau', slug: 'yuki-moreau', role: 'dessinateur', city: null, avatar: null }],
    fundingGoals: [],
    reviews: [],
    collectionItems: [
      { id: 'ill-1', title: 'Aube', thumbnail: null, likeCount: 3, category: 'personnages', categoryLabel: 'Personnages', order: 0, is18plus: false },
      { id: 'ill-2', title: 'Crépuscule', thumbnail: null, likeCount: 5, category: 'decors', categoryLabel: 'Décors', order: 1, is18plus: false },
    ],
    ...overrides,
  };
}

describe('CollectionOeuvre (DR-12 V3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getReactionState).mockResolvedValue({});
  });

  it('renders the "Collection" badge, meta line, and the "Voir la galerie" CTA', () => {
    render(<CollectionOeuvre work={makeWork()} account={null} />);
    // "Collection" appears as the accent type badge and again as the DÉTAILS "Type" value.
    expect(screen.getAllByText('Collection').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 illustrations · collection')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Voir la galerie' });
    expect(cta).toHaveAttribute('href', '/galerie?collection=w-carnet');
  });

  it('renders the ordered member grid as illustration links with alt text, no chapter list', () => {
    render(<CollectionOeuvre work={makeWork()} account={null} />);
    const first = screen.getByRole('link', { name: /Aube/ });
    expect(first).toHaveAttribute('href', '/illustration/ill-1');
    expect(screen.getByRole('img', { name: 'Aube' })).toBeInTheDocument();
    expect(screen.queryByText('Chapitres')).not.toBeInTheDocument();
  });

  it('shows the empty state when the collection has no members', () => {
    render(<CollectionOeuvre work={makeWork({ collectionItems: [] })} account={null} />);
    expect(screen.getByText('Aucune illustration')).toBeInTheDocument();
  });

  it('shows "Gérer la collection" only to an owner', () => {
    const { rerender } = render(<CollectionOeuvre work={makeWork()} account={null} />);
    expect(screen.queryByRole('link', { name: 'Gérer la collection' })).not.toBeInTheDocument();
    rerender(<CollectionOeuvre work={makeWork()} account={owner} />);
    expect(screen.getByRole('link', { name: 'Gérer la collection' })).toHaveAttribute('href', '/collection/w-carnet/gerer');
  });

  // ── DR-12 R? : like / save / share / report parity with a standard Work ──────────

  it('renders the ♥ like toggle bound to the work reaction (targetType work + slug)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.likeReaction).mockResolvedValue({ active: true, count: 1 });
    render(<CollectionOeuvre work={makeWork()} account={owner} />);

    const likeBtn = screen.getByRole('button', { name: "J'aime" });
    expect(likeBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(likeBtn);
    expect(likeBtn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(api.likeReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'carnet-d-encre' }));
  });

  it('renders the "Ma liste" save toggle bound to the work reaction', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaction).mockResolvedValue({ active: true, count: 1 });
    render(<CollectionOeuvre work={makeWork()} account={owner} />);

    const saveBtn = screen.getByRole('button', { name: 'Ajouter à ma liste' });
    expect(saveBtn).toHaveTextContent('Ma liste');
    await user.click(saveBtn);
    const toggled = screen.getByRole('button', { name: 'Retirer de ma liste' });
    expect(toggled).toHaveTextContent('Dans ma liste');
    await waitFor(() => expect(api.saveReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'carnet-d-encre' }));
  });

  it('anonymous ♥ click redirects to /connexion', async () => {
    const user = userEvent.setup();
    render(<CollectionOeuvre work={makeWork()} account={null} />);
    await user.click(screen.getByRole('button', { name: "J'aime" }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });

  it('renders the ShareReportBox ("Partager" / "Signaler") in the sidebar', () => {
    render(<CollectionOeuvre work={makeWork()} account={null} />);
    expect(screen.getByRole('button', { name: /Partager/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Signaler/ })).toBeInTheDocument();
  });
});
