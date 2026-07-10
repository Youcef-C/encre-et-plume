import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CollectionDetail, MyProjectItem, MyProjectsResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyProjects: vi.fn(),
    getCollection: vi.fn(),
  };
});

const replace = vi.fn();
const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
  usePathname: () => '/projets',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import ProjetsClient from '../components/projets/ProjetsClient';

const account: AccountSummary = {
  id: 'u1',
  displayName: 'Camille R.',
  email: 'c@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-roux',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const project = (over: Partial<MyProjectItem> = {}): MyProjectItem => ({
  id: 'p1',
  title: 'Lames de Brume',
  meta: 'Manga · Seinen · en cours',
  cover: null,
  slug: 'lames-de-brume',
  type: 'Manga',
  status: 'en cours',
  members: [
    { id: 'u1', name: 'Camille R.', role: 'scenariste', self: true },
    { id: 'u2', name: 'Yuki', role: 'dessinateur', self: false },
  ],
  step: 'encrage Ch.1',
  nextReleaseAt: '2026-06-21T00:00:00.000Z',
  kind: 'project',
  illustrationCount: null,
  ...over,
});

const collection = (over: Partial<MyProjectItem> = {}): MyProjectItem =>
  project({
    id: 'c1',
    title: "Carnet d'encre",
    meta: '12 illustrations',
    slug: 'carnet-encre',
    type: 'Illustration(s)',
    status: null, // collections have no lifecycle → no status badge
    members: [{ id: 'u1', name: 'Camille R.', role: 'dessinateur', self: true }],
    step: null,
    nextReleaseAt: null,
    kind: 'collection',
    illustrationCount: 12,
    ...over,
  });

const illustration = (over: Partial<MyProjectItem> = {}): MyProjectItem =>
  project({
    id: 'i1',
    title: 'Étude de pluie',
    meta: 'Illustration',
    cover: 'https://cdn.test/i1.jpg',
    slug: null, // standalone illustrations have no slug
    type: 'illustration',
    status: null,
    members: [{ id: 'u1', name: 'Camille R.', role: 'dessinateur', self: true }],
    step: null,
    nextReleaseAt: null,
    kind: 'illustration',
    illustrationCount: null,
    ...over,
  });

const response = (items: MyProjectItem[], over: Partial<MyProjectsResponse> = {}): MyProjectsResponse => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { active: items.length, enRevision: 0, nextReleaseAt: '2026-06-21T00:00:00.000Z' },
  ...over,
});

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <ProjetsClient />
    </SessionContext.Provider>,
  );
}

const collectionDetail = (over: Partial<CollectionDetail> = {}): CollectionDetail =>
  ({
    id: 'c1',
    slug: 'carnet-encre',
    title: "Carnet d'encre",
    cover: null,
    count: 2,
    description: null,
    genres: [],
    hashtags: [],
    items: [
      { id: 'ill-1', title: 'Pluie', thumbnail: 'https://cdn.test/1.jpg', likeCount: 3, category: 'illustration', categoryLabel: 'Illustration', order: 0, is18plus: false },
      { id: 'ill-2', title: 'Brume', thumbnail: null, likeCount: 1, category: 'illustration', categoryLabel: 'Illustration', order: 1, is18plus: false },
    ],
    owner: { id: 'u1', name: 'Camille R.', slug: 'camille-roux' },
    ...over,
  }) as CollectionDetail;

const getMine = () => api.getMyProjects as ReturnType<typeof vi.fn>;
const getColl = () => api.getCollection as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

describe('ProjetsClient (CS-12)', () => {
  it('renders header, derived summary line, and one card per item with full content', async () => {
    getMine().mockResolvedValue(response([project(), collection()]));
    renderClient();

    expect(screen.getByRole('heading', { level: 1, name: 'Mes projets' })).toBeInTheDocument();

    await screen.findByText('Lames de Brume');
    // Summary derived from response.summary
    expect(screen.getByText(/2 actifs · prochaine sortie/)).toBeInTheDocument();

    // Type + status badges (also appear as filter chips → assert ≥1 occurrence).
    expect(screen.getAllByText('Manga').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Illustration(s)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('En cours').length).toBeGreaterThanOrEqual(2);

    // Meta line for the collection
    expect(screen.getByText(/12 illustrations/)).toBeInTheDocument();

    // Modifier is labelled with the project title
    expect(screen.getByRole('link', { name: 'Modifier Lames de Brume' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Modifier Carnet d'encre" })).toBeInTheDocument();
  });

  it('renders NO status badge on a collection card (series-only badge)', async () => {
    getMine().mockResolvedValue(response([collection()]));
    renderClient();

    await screen.findByText("Carnet d'encre");
    const card = screen.getByText("Carnet d'encre").closest('li')!;
    // Type badge stays…
    expect(within(card).getByText('Illustration(s)')).toBeInTheDocument();
    // …but no status badge (no "en cours"/"publié"/etc. text inside the card).
    expect(within(card).queryByText(/en cours|en révision|en pause|publié/i)).not.toBeInTheDocument();
  });

  it('renders Modifier (edit) + Voir (public) actions with correct hrefs and aria-labels for a project and a collection', async () => {
    getMine().mockResolvedValue(response([project(), collection()]));
    renderClient();

    await screen.findByText('Lames de Brume');
    // Project: Modifier → workspace by slug; Voir → public œuvre by slug.
    expect(screen.getByRole('link', { name: 'Modifier Lames de Brume' })).toHaveAttribute('href', '/projet/lames-de-brume');
    expect(screen.getByRole('link', { name: 'Voir Lames de Brume' })).toHaveAttribute('href', '/oeuvre/lames-de-brume');
    // Collection: Modifier → manage view by id; Voir → public œuvre by slug.
    expect(screen.getByRole('link', { name: "Modifier Carnet d'encre" })).toHaveAttribute('href', '/collection/c1/gerer');
    expect(screen.getByRole('link', { name: "Voir Carnet d'encre" })).toHaveAttribute('href', '/oeuvre/carnet-encre');
  });

  it('renders a standalone illustration card: "Illustration" badge, no status badge, Voir/Modifier to /illustration/{id}', async () => {
    getMine().mockResolvedValue(response([illustration(), collection()]));
    renderClient();

    await screen.findByText('Étude de pluie');
    const card = screen.getByText('Étude de pluie').closest('li')!;
    // Singular "Illustration" badge (collections keep the plural "Illustration(s)").
    expect(within(card).getByText('Illustration')).toBeInTheDocument();
    expect(within(card).queryByText('Illustration(s)')).not.toBeInTheDocument();
    // No status badge.
    expect(within(card).queryByText(/en cours|en révision|en pause|publié/i)).not.toBeInTheDocument();
    // Actions target the illustration routes by id, despite slug being null.
    expect(screen.getByRole('link', { name: 'Voir Étude de pluie' })).toHaveAttribute('href', '/illustration/i1');
    expect(screen.getByRole('link', { name: 'Modifier Étude de pluie' })).toHaveAttribute('href', '/illustration/i1/modifier');
    // Collection still shows the plural badge + its own hrefs.
    const collCard = screen.getByText("Carnet d'encre").closest('li')!;
    expect(within(collCard).getByText('Illustration(s)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Modifier Carnet d'encre" })).toHaveAttribute('href', '/collection/c1/gerer');
  });

  it('differentiates collection (layers glyph + count) from standalone illustration (image glyph, no count)', async () => {
    getMine().mockResolvedValue(response([collection({ illustrationCount: 12 }), illustration()]));
    renderClient();

    await screen.findByText("Carnet d'encre");
    const collCard = screen.getByText("Carnet d'encre").closest('li')!;
    expect(within(collCard).getByTestId('kind-glyph-collection')).toBeInTheDocument();
    expect(within(collCard).getByText(/12 illustrations/)).toBeInTheDocument();

    const illCard = screen.getByText('Étude de pluie').closest('li')!;
    expect(within(illCard).getByTestId('kind-glyph-illustration')).toBeInTheDocument();
    expect(within(illCard).queryByText(/illustrations/)).not.toBeInTheDocument();
  });

  it('expands a collection card to lazy-fetch and list its members (links to /illustration/{id}); toggles aria-expanded; caches', async () => {
    getMine().mockResolvedValue(response([collection()]));
    getColl().mockResolvedValue(collectionDetail());
    const user = userEvent.setup();
    renderClient();

    const collectionCard = (await screen.findByText("Carnet d'encre")).closest('li')!;
    const toggle = screen.getByRole('button', { name: /voir les illustrations/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(getColl()).not.toHaveBeenCalled();

    // The toggle is a pill with a VISIBLE text label (a real word makes it inherently wider than tall,
    // never an icon-only square) + no fixed square width. The live bounding-box ratio is asserted in the
    // Playwright spec (CS12-E12: width > height × 1.5).
    expect(toggle).toHaveTextContent(/illustrations/i);
    const tStyle = toggle.getAttribute('style') ?? '';
    expect(tStyle).not.toMatch(/width:\s*44px/);

    // Collapsed collection carries no darker-expanded marker yet.
    expect(collectionCard).not.toHaveAttribute('data-expanded', 'true');

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(getColl()).toHaveBeenCalledWith('c1');

    // Polish: the expanded collection card is marked as the darker/active one.
    expect(collectionCard).toHaveAttribute('data-expanded', 'true');

    // Members render as FULL illustration cards inside a nested (hierarchy) container, each with the
    // same Voir + Modifier actions as an uncollected illustration.
    const nested = await screen.findByTestId('collection-nested');
    expect(within(nested).getByRole('link', { name: 'Voir Pluie' })).toHaveAttribute('href', '/illustration/ill-1');
    expect(within(nested).getByRole('link', { name: 'Modifier Pluie' })).toHaveAttribute('href', '/illustration/ill-1/modifier');
    // Each member is an illustration card (singular badge + image glyph), not a bare thumbnail.
    const memberCard = within(nested).getByText('Pluie').closest('li')!;
    expect(within(memberCard).getByTestId('kind-glyph-illustration')).toBeInTheDocument();
    expect(within(memberCard).getByText('Illustration')).toBeInTheDocument();

    // Polish: the toggle is a right-aligned ACTION next to Voir/Modifier, not a separate boxed control.
    const collActions = screen.getByRole('link', { name: "Modifier Carnet d'encre" }).parentElement!;
    expect(within(collActions).getByRole('button', { name: /illustrations de Carnet/i })).toBeInTheDocument();

    // Polish: SUBTLE containment — the nested region has NO ink contour, NO beige/paper fill, and NO
    // vertical connector bar (border-left).
    const nestStyle = nested.getAttribute('style') ?? '';
    expect(nestStyle).not.toMatch(/solid var\(--ink\)/);
    expect(nestStyle).not.toMatch(/background[^;]*var\(--paper\)/);
    expect(nestStyle).not.toMatch(/border-left/);
    // Nested member cards use a lighter treatment, not the top-level 3px ink border.
    expect(memberCard.getAttribute('style') ?? '').not.toMatch(/3px solid var\(--ink\)/);

    // Collapse then re-expand — no refetch (cached).
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(getColl()).toHaveBeenCalledTimes(1);
  });

  it('expands when clicking the collection card body (outside the caret and links)', async () => {
    getMine().mockResolvedValue(response([collection()]));
    getColl().mockResolvedValue(collectionDetail());
    const user = userEvent.setup();
    renderClient();

    const title = await screen.findByText("Carnet d'encre");
    const toggle = screen.getByRole('button', { name: /voir les illustrations/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(title);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(getColl()).toHaveBeenCalledWith('c1');
  });

  it('does not toggle when clicking a link inside the collection card', async () => {
    getMine().mockResolvedValue(response([collection()]));
    const user = userEvent.setup();
    renderClient();

    await screen.findByText("Carnet d'encre");
    const toggle = screen.getByRole('button', { name: /voir les illustrations/i });
    await user.click(screen.getByRole('link', { name: "Modifier Carnet d'encre" }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(getColl()).not.toHaveBeenCalled();
  });

  it('does not render an expand control on project or standalone illustration cards', async () => {
    getMine().mockResolvedValue(response([project(), illustration()]));
    renderClient();

    await screen.findByText('Lames de Brume');
    expect(screen.queryByRole('button', { name: /voir les illustrations/i })).not.toBeInTheDocument();
  });

  it('omits the Voir button when the row has no slug (no valid public URL)', async () => {
    getMine().mockResolvedValue(response([project({ slug: null })]));
    renderClient();

    await screen.findByText('Lames de Brume');
    // Modifier still renders (falls back to id); Voir is gone.
    expect(screen.getByRole('link', { name: 'Modifier Lames de Brume' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voir Lames de Brume' })).not.toBeInTheDocument();
  });

  it('renders status filter chips as a single-active aria-pressed group; clicking "En pause" refetches and syncs the URL', async () => {
    getMine().mockResolvedValue(response([project()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Lames de Brume');

    const statusGroup = screen.getByRole('group', { name: 'Filtrer par statut' });
    const tous = within(statusGroup).getByRole('button', { name: 'Tous' });
    const enPause = within(statusGroup).getByRole('button', { name: 'En pause' });
    expect(tous).toHaveAttribute('aria-pressed', 'true');
    expect(enPause).toHaveAttribute('aria-pressed', 'false');

    await user.click(enPause);

    await waitFor(() => expect(enPause).toHaveAttribute('aria-pressed', 'true'));
    expect(tous).toHaveAttribute('aria-pressed', 'false');
    expect(getMine()).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all', status: 'en-pause' }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('statut=en-pause'));
  });

  it('renders the FIVE type filter chips (single-active, aria-pressed)', async () => {
    getMine().mockResolvedValue(response([project(), collection()]));
    renderClient();
    await screen.findByText('Lames de Brume');

    const typeGroup = screen.getByRole('group', { name: 'Filtrer par type' });
    for (const label of ['Tous', 'Manga', 'Histoire', 'Illustrations', 'Collections']) {
      expect(within(typeGroup).getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Only "Tous" is active by default; "Illustration(s)" (the old single label) is gone.
    expect(within(typeGroup).getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(typeGroup).queryByRole('button', { name: 'Illustration(s)' })).not.toBeInTheDocument();
  });

  it('selecting "Collections" syncs ?type=collections and shows only collection cards', async () => {
    getMine().mockResolvedValue(response([project(), collection()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Lames de Brume');

    // Backend returns only collections under this filter.
    getMine().mockResolvedValue(response([collection()]));
    const typeGroup = screen.getByRole('group', { name: 'Filtrer par type' });
    const collections = within(typeGroup).getByRole('button', { name: 'Collections' });
    await user.click(collections);

    await waitFor(() => expect(collections).toHaveAttribute('aria-pressed', 'true'));
    expect(getMine()).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all', type: 'collections' }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('type=collections'));
    // Only the collection card (with its expand control), no project card.
    await screen.findByText("Carnet d'encre");
    expect(screen.queryByText('Lames de Brume')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /illustrations de Carnet/i })).toBeInTheDocument();
  });

  it('selecting "Illustrations" syncs ?type=illustrations and shows flat illustration cards (incl. a collected one)', async () => {
    getMine().mockResolvedValue(response([project(), collection()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Lames de Brume');

    // Backend returns illustrations flat — including one that lives inside a collection.
    getMine().mockResolvedValue(response([illustration(), illustration({ id: 'i2', title: 'Pluie battante' })]));
    const typeGroup = screen.getByRole('group', { name: 'Filtrer par type' });
    const illustrations = within(typeGroup).getByRole('button', { name: 'Illustrations' });
    await user.click(illustrations);

    await waitFor(() => expect(illustrations).toHaveAttribute('aria-pressed', 'true'));
    expect(getMine()).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'all', type: 'illustrations' }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('type=illustrations'));
    // Flat illustration cards, no expand control anywhere.
    const collected = await screen.findByText('Pluie battante');
    const card = collected.closest('li')!;
    expect(within(card).getByRole('link', { name: 'Voir Pluie battante' })).toHaveAttribute('href', '/illustration/i2');
    expect(screen.queryByRole('button', { name: /illustrations de/i })).not.toBeInTheDocument();
  });

  it('composes the type chip with the status chip (both apply together)', async () => {
    getMine().mockResolvedValue(response([project()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Lames de Brume');

    const statusGroup = screen.getByRole('group', { name: 'Filtrer par statut' });
    const typeGroup = screen.getByRole('group', { name: 'Filtrer par type' });
    await user.click(within(statusGroup).getByRole('button', { name: 'En pause' }));
    await user.click(within(typeGroup).getByRole('button', { name: 'Manga' }));

    await waitFor(() =>
      expect(getMine()).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: 'all', status: 'en-pause', type: 'manga' }),
      ),
    );
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('type=manga'));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('statut=en-pause'));
  });

  it('debounces the search input then refetches with q, and shows "Aucun résultat" when filtered empty', async () => {
    getMine().mockResolvedValue(response([project()]));
    vi.useFakeTimers();
    try {
      renderClient();
      await act(async () => {
        await Promise.resolve();
      });

      const search = screen.getByLabelText('Rechercher un projet…');
      getMine().mockResolvedValue(response([], { summary: { active: 1, enRevision: 0, nextReleaseAt: null } }));
      fireEvent.change(search, { target: { value: 'zzz' } });
      await act(async () => {
        vi.advanceTimersByTime(400);
        await Promise.resolve();
      });

      expect(getMine()).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'zzz' }));
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('q=zzz'));
      expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a loading skeleton, an empty state with a CTA, and an error state with Réessayer', async () => {
    // Loading
    let resolve!: (r: MyProjectsResponse) => void;
    getMine().mockReturnValue(new Promise<MyProjectsResponse>((r) => (resolve = r)));
    const { rerender } = renderClient();
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    await act(async () => {
      resolve(response([], { summary: { active: 0, enRevision: 0, nextReleaseAt: null } }));
      await Promise.resolve();
    });
    expect(await screen.findByText('Aucun projet — créez-en un')).toBeInTheDocument();

    // Error + retry
    getMine().mockRejectedValueOnce({ statusCode: 500, message: 'boom', error: 'X' });
    rerender(
      <SessionContext.Provider value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
        <ProjetsClient key="retry" />
      </SessionContext.Provider>,
    );
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    getMine().mockResolvedValue(response([project()]));
    fireEvent.click(retry);
    await screen.findByText('Lames de Brume');
  });

  it('navigates to the /creer wizard from "＋ Nouveau projet" (CS-1)', async () => {
    getMine().mockResolvedValue(response([project()]));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('Lames de Brume');

    await user.click(screen.getByRole('button', { name: /Nouveau projet/ }));
    expect(push).toHaveBeenCalledWith('/creer');
  });

  it('renders a "Terminé" badge for a published one-shot project (CS-1 §11)', async () => {
    getMine().mockResolvedValue(response([project({ status: 'terminé' })]));
    renderClient();
    await screen.findByText('Lames de Brume');
    expect(screen.getAllByText('Terminé').length).toBeGreaterThanOrEqual(1);
  });

  it('prompts to sign in when logged out', () => {
    renderClient(null);
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute(
      'href',
      '/connexion?redirect=/projets',
    );
  });
});
