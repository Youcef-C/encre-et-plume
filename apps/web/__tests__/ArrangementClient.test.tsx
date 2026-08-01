import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ChapterDto, ProjectWorkspaceResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// CS-6 — « Réorganiser les pages ». The screen binds to the REAL contracts built in Part A:
// GET /projects/:slug/chapters, PATCH /chapters/:id/page-order and PATCH /chapters/:id (the
// « Couverture » toggle rides the ordinary chapter PATCH — it is a field, not a resource).

const router = { push: vi.fn(), replace: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'lames-de-brume' }),
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/api', () => ({
  getProjectChapters: vi.fn(),
  getProjectWorkspace: vi.fn(),
  updateChapterPageOrder: vi.fn(),
  updateChapter: vi.fn(),
  createPage: vi.fn(),
  deletePage: vi.fn(),
}));

import * as api from '../lib/api';
import ArrangementClient from '../components/projet/ArrangementClient';

const account: AccountSummary = {
  id: 'acc-me',
  displayName: 'Moi',
  email: 'moi@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'moi',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

function pageRef(over: Partial<ChapterDto['pages'][number]> = {}): ChapterDto['pages'][number] {
  return { id: 'p1', title: 'Page 1', stage: 'valide', thumbnailUrl: null, fileTags: [], position: 0, ...over };
}

function chapter(over: Partial<ChapterDto> = {}): ChapterDto {
  return {
    id: 'ch-2',
    projectId: 'proj-1',
    title: 'La marée noire',
    number: 2,
    resume: null,
    status: 'en_cours',
    progressPct: 40,
    targetPages: 20,
    plancheCount: 3,
    likeCount: 0,
    hasCover: true,
    pages: [
      pageRef({ id: 'p1', title: 'Page 1', position: 0 }),
      // A « double » is a two-page spread: it consumes TWO derived page numbers (P. 2-3).
      pageRef({ id: 'p2', title: 'Page 2', position: 1, fileTags: ['double'] }),
      pageRef({ id: 'p3', title: 'Page 3', position: 2 }),
    ],
    ...over,
  };
}

const chapterOne = () =>
  chapter({ id: 'ch-1', number: 1, title: 'Le port', plancheCount: 1, pages: [pageRef({ id: 'q1', title: 'Page A' })] });
const prologue = () => chapter({ id: 'ch-0', number: 0, title: 'Avant', plancheCount: 0, pages: [] });

function workspace(over: Partial<ProjectWorkspaceResponse> = {}): ProjectWorkspaceResponse {
  return {
    id: 'proj-1',
    slug: 'lames-de-brume',
    workSlug: 'lames-de-brume-oeuvre',
    title: 'Lames de brume',
    synopsis: '',
    hashtags: [],
    collabOpen: false,
    visibility: 'prive',
    cover: null,
    members: [],
    chapters: [],
    pages: [],
    labels: [],
    reviews: { summary: { overall: 0, story: 0, art: 0, count: 0 }, items: [] },
    viewer: { isMember: true, isOwner: true, canWrite: true, canManage: true },
    ...over,
  } as ProjectWorkspaceResponse;
}

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderPage() {
  return render(
    <SessionContext.Provider value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <ArrangementClient />
    </SessionContext.Provider>,
  );
}

/** The grid tile for a card, by its stable data attribute. */
function tile(pageId: string): HTMLElement {
  const el = document.querySelector(`[data-page-id="${pageId}"]`);
  if (!el) throw new Error(`no tile for ${pageId}`);
  return el as HTMLElement;
}

/** The tiles in drawn order. */
const order = () => [...document.querySelectorAll('[data-page-id]')].map((t) => t.getAttribute('data-page-id'));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  mocked.getProjectChapters.mockResolvedValue({ chapters: [prologue(), chapterOne(), chapter()], canWrite: true });
  mocked.getProjectWorkspace.mockResolvedValue(workspace());
});

// ── F1 · header (proto 1696, applied per D-7) ────────────────────────────────
describe('ArrangementClient — header', () => {
  it('renders the back link, the title, the chapter meta, « Aperçu » and an inert « Publier ▾ »', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Réorganiser les pages' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Projet/ })).toHaveAttribute('href', '/projet/lames-de-brume');
    // D-7: the prototype's own meta. The count is the DERIVED last page number, so the double counts
    // as two — consistent with the « P. n » labels below.
    expect(screen.getByText('Ch. 2 · 4 planches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aperçu' })).toHaveAttribute('href', '/oeuvre/lames-de-brume-oeuvre');
    // D-2: the control the story lists, but its destination is CS-9 — rendered, and inert so it does
    // not lie about what it does.
    expect(screen.getByRole('button', { name: /Publier/ })).toBeDisabled();
  });

  it('shows a loading state, then an error band when the chapters cannot be read', async () => {
    mocked.getProjectChapters.mockRejectedValue({ message: 'Projet introuvable' });
    renderPage();
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Projet introuvable');
  });
});

// ── F2 · chapter tabs (proto 1705) ───────────────────────────────────────────
describe('ArrangementClient — chapter tabs', () => {
  it('lists the chapters newest-first (D-8), selects the highest by default and shows the drag hint', async () => {
    renderPage();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Ch. 2', 'Ch. 1', 'Prologue']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/glisser pour réordonner/)).toBeInTheDocument();
  });

  it('switches the grid to the chosen chapter and remembers it in the URL', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await userEvent.click(screen.getByRole('tab', { name: 'Ch. 1' }));
    expect(screen.getByText('Ch. 1 · 1 planche')).toBeInTheDocument();
    expect(order()).toEqual(['q1']);
    expect(router.replace).toHaveBeenCalledWith('/projet/lames-de-brume/arrangement?ch=ch-1', { scroll: false });
  });

  it('opens on the chapter named by ?ch= (a reload keeps the tab)', async () => {
    searchParams = new URLSearchParams('ch=ch-1');
    renderPage();
    expect(await screen.findByText('Ch. 1 · 1 planche')).toBeInTheDocument();
  });
});

// ── F3 / F4 · the grid, its « P. n » labels and the cover badge ───────────────
describe('ArrangementClient — grid', () => {
  it('draws the tiles in slot order with the derived « P. n » labels, a double spanning two', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(order()).toEqual(['p1', 'p2', 'p3']);
    expect(within(tile('p1')).getByText('P. 1')).toBeInTheDocument();
    expect(within(tile('p2')).getByText('P. 2-3')).toBeInTheDocument();
    expect(within(tile('p3')).getByText('P. 4')).toBeInTheDocument();
    // D-3 — the handle is an icon, and the control carries the label the story asks for.
    expect(within(tile('p1')).getByLabelText(/^Réorganiser/)).toBeInTheDocument();
  });

  // User decision 2026-08-01: the cover is AUTOMATIC — it is whatever page sits in the first slot.
  it('flags the FIRST tile as the cover', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toHaveTextContent('COUV.');
    expect(within(tile('p3')).queryByLabelText('Couverture du chapitre')).toBeNull();
  });

  // CS-6 (user, 2026-08-01) — « Couverture » is a per-CHAPTER toggle, not a per-page designation.
  // Off ⇒ no badge anywhere: the chapter simply opens on an ordinary page.
  it('draws no cover badge when the chapter does not open on one', async () => {
    mocked.getProjectChapters.mockResolvedValue({ chapters: [chapter({ hasCover: false })], canWrite: true });
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(screen.queryByLabelText('Couverture du chapitre')).toBeNull();
    expect(screen.getByRole('switch', { name: /couverture/i })).not.toBeChecked();
  });

  it('toggles the cover through the ordinary chapter PATCH, optimistically', async () => {
    mocked.updateChapter.mockImplementation(async (_id: string, body: { hasCover: boolean }) =>
      chapter({ hasCover: body.hasCover }),
    );
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: /couverture/i }));

    await waitFor(() => expect(screen.queryByLabelText('Couverture du chapitre')).toBeNull());
    expect(mocked.updateChapter).toHaveBeenCalledWith('ch-2', { hasCover: false });
  });

  it('puts the toggle back when the save fails', async () => {
    mocked.updateChapter.mockRejectedValue({ message: 'Boom' });
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await userEvent.click(screen.getByRole('switch', { name: /couverture/i }));
    await screen.findByRole('alert');
    expect(screen.getByRole('switch', { name: /couverture/i })).toBeChecked();
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toBeInTheDocument();
  });

  it('moves the badge with the first slot when the order changes', async () => {
    mocked.updateChapterPageOrder.mockResolvedValue({
      ...chapter(),
      pages: [
        { ...chapter().pages[2], position: 0 },
        { ...chapter().pages[0], position: 1 },
        { ...chapter().pages[1], position: 2 },
      ],
    });
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}{ArrowLeft}');
    await waitFor(() => expect(within(tile('p3')).getByLabelText('Couverture du chapitre')).toBeInTheDocument());
    expect(within(tile('p1')).queryByLabelText('Couverture du chapitre')).toBeNull();
  });

  // The bug this pins: with a cover already DESIGNATED, moving another card into the first slot used
  // to leave the « COUV. » chip behind on the old opening page. The chip must move with slot 0, and
  // move OPTIMISTICALLY — the assertion runs before the mocked PATCH resolves.
  it('re-designates the new first slot as the cover, without waiting for the server', async () => {
    const designated = chapter({ hasCover: true });
    mocked.getProjectChapters.mockResolvedValue({ chapters: [designated], canWrite: true });
    let resolvePatch: (c: unknown) => void = () => {};
    mocked.updateChapterPageOrder.mockReturnValue(new Promise((r) => (resolvePatch = r)));

    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toBeInTheDocument();

    await moveWithKeyboard('p3', '{ArrowLeft}{ArrowLeft}');

    await waitFor(() => expect(within(tile('p3')).getByLabelText('Couverture du chapitre')).toBeInTheDocument());
    expect(within(tile('p1')).queryByLabelText('Couverture du chapitre')).toBeNull();
    resolvePatch({ ...designated });
  });

  it('puts the cover back where it was when the reorder fails', async () => {
    mocked.getProjectChapters.mockResolvedValue({ chapters: [chapter({ hasCover: true })], canWrite: true });
    mocked.updateChapterPageOrder.mockRejectedValue({ message: 'Boom' });
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}{ArrowLeft}');
    await screen.findByRole('alert');
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toBeInTheDocument();
    expect(within(tile('p3')).queryByLabelText('Couverture du chapitre')).toBeNull();
  });

  it('shows « Aucune page » for an empty chapter', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await userEvent.click(screen.getByRole('tab', { name: 'Prologue' }));
    expect(screen.getByText('Aucune page')).toBeInTheDocument();
  });
});

/** Focus a tile's drag handle and press the reorder keys. */
async function moveWithKeyboard(pageId: string, keys: string) {
  const handle = within(tile(pageId)).getByLabelText(/^Réorganiser/);
  handle.focus();
  await userEvent.keyboard(keys);
}

// ── F10 / F8 · keyboard reorder, one commit path, optimistic + revert ─────────
describe('ArrangementClient — reorder', () => {
  /** The chapter as the API answers a reorder: its cards re-read in the new slot order. */
  function reordered(ids: string[]): ChapterDto {
    const base = chapter();
    return {
      ...base,
      pages: ids.map((id, i) => ({ ...base.pages.find((p) => p.id === id)!, position: i })),
    };
  }

  // The drag handle IS the keyboard path (user decision 2026-08-01: no reorder buttons on the tile),
  // so the grid stays operable without a pointer — arrow keys move the focused tile.
  it('moves a tile with the arrow keys on its handle, relabels, and PATCHes the whole new order', async () => {
    mocked.updateChapterPageOrder.mockResolvedValue(reordered(['p1', 'p3', 'p2']));
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}');
    await waitFor(() =>
      expect(mocked.updateChapterPageOrder).toHaveBeenCalledWith('ch-2', { pageIds: ['p1', 'p3', 'p2'] }),
    );
    expect(order()).toEqual(['p1', 'p3', 'p2']);
    // The numbering follows the order: the double now sits last and takes P. 3-4.
    expect(within(tile('p3')).getByText('P. 2')).toBeInTheDocument();
    expect(within(tile('p2')).getByText('P. 3-4')).toBeInTheDocument();
    // …and the moved tile keeps focus, so a second press continues from where the author is looking.
    expect(within(tile('p3')).getByLabelText(/^Réorganiser/)).toHaveFocus();
  });

  it('does nothing at the two ends', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p1', '{ArrowLeft}');
    await moveWithKeyboard('p3', '{ArrowRight}');
    expect(mocked.updateChapterPageOrder).not.toHaveBeenCalled();
    expect(order()).toEqual(['p1', 'p2', 'p3']);
  });

  it('announces the save and then the result', async () => {
    let resolve: (c: ChapterDto) => void = () => {};
    mocked.updateChapterPageOrder.mockReturnValue(new Promise<ChapterDto>((r) => (resolve = r)));
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}');
    expect(screen.getByRole('status')).toHaveTextContent('Enregistrement…');
    resolve(chapter());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ordre enregistré'));
  });

  it('reverts to the previous order and surfaces the API message when the save fails', async () => {
    mocked.updateChapterPageOrder.mockRejectedValue({ message: 'L’ordre des pages est invalide.' });
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}');
    expect(await screen.findByRole('alert')).toHaveTextContent('L’ordre des pages est invalide.');
    expect(order()).toEqual(['p1', 'p2', 'p3']);
    expect(within(tile('p3')).getByText('P. 4')).toBeInTheDocument();
  });

  // F5 — the prototype's dashed insertion gap, drawn where the card would land.
  it('shows the « déposer ici » gap while a tile is dragged over another', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
    };
    expect(screen.queryByText('déposer ici')).toBeNull();
    fireEvent.dragStart(tile('p3'), { dataTransfer });
    fireEvent.dragOver(tile('p1'), { dataTransfer });
    expect(screen.getByText('déposer ici')).toBeInTheDocument();
    // The tiles KEEP their real order while a card is held — moving the dragged node mid-drag is
    // what killed the gesture in a real browser; only the gap marks where it would land.
    expect(order()).toEqual(['p1', 'p2', 'p3']);
    expect(tile('p3')).toHaveAttribute('data-dragging');
    fireEvent.dragEnd(tile('p3'), { dataTransfer });
    expect(screen.queryByText('déposer ici')).toBeNull();
    expect(tile('p3')).not.toHaveAttribute('data-dragging');
  });

  it('commits the previewed order on drop', async () => {
    mocked.updateChapterPageOrder.mockResolvedValue(reordered(['p3', 'p1', 'p2']));
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
    };
    fireEvent.dragStart(tile('p3'), { dataTransfer });
    fireEvent.dragOver(tile('p1'), { dataTransfer });
    fireEvent.drop(tile('p1'), { dataTransfer });
    await waitFor(() =>
      expect(mocked.updateChapterPageOrder).toHaveBeenCalledWith('ch-2', { pageIds: ['p3', 'p1', 'p2'] }),
    );
  });
});

// ── This screen REARRANGES, it does not create or destroy (user decision 2026-08-01) ─────────
describe('ArrangementClient — scope', () => {
  it('offers no add, no delete, no cover and no order buttons — only the drag handle', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(screen.queryByRole('button', { name: /Ajouter/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    // No per-page « définir comme couverture » button — the cover is positional, and the only
    // cover control is the per-chapter checkbox.
    expect(screen.queryByRole('button', { name: /couverture/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Déplacer/ })).toBeNull();
    // Every tile still carries exactly one control: its handle.
    expect(screen.getAllByLabelText(/^Réorganiser/)).toHaveLength(3);
  });

  // Rearranging touches ONE endpoint. Creating and deleting a page stay on CS-2/CS-7's surfaces, and
  // the cover needs no call of its own — it follows the order.
  it('never calls the create / delete endpoints, and reordering alone touches no other route', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    await moveWithKeyboard('p3', '{ArrowLeft}');
    expect(mocked.createPage).not.toHaveBeenCalled();
    expect(mocked.deletePage).not.toHaveBeenCalled();
    expect(mocked.updateChapter).not.toHaveBeenCalled();
    expect(mocked.updateChapterPageOrder).toHaveBeenCalledTimes(1);
  });
});

// ── B5 mirrored · a reader gets no write affordance at all ───────────────────
describe('ArrangementClient — read-only viewer', () => {
  beforeEach(() => {
    mocked.getProjectChapters.mockResolvedValue({ chapters: [chapter()], canWrite: false });
    mocked.getProjectWorkspace.mockResolvedValue(
      workspace({ viewer: { isMember: true, isOwner: false, canWrite: false, canManage: false } }),
    );
  });

  it('renders no handle and no drag hint — the grid is read-only', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(order()).toEqual(['p1', 'p2', 'p3']);
    expect(screen.queryByLabelText(/^Réorganiser/)).toBeNull();
    expect(screen.queryByText(/glisser pour réordonner/)).toBeNull();
    // The cover badge is information, not an affordance — it stays.
    expect(within(tile('p1')).getByLabelText('Couverture du chapitre')).toBeInTheDocument();
    expect(tile('p1')).not.toHaveAttribute('draggable', 'true');
  });
});

// ── design-system + F7 guards ────────────────────────────────────────────────
describe('ArrangementClient — house rules', () => {
  it('renders no check/cross glyph and no emoji as text', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(document.body.textContent ?? '').not.toMatch(/[✓✔✅✕✖❌✗\u{1F300}-\u{1FAFF}]/u);
  });

  it('offers NO reading-direction control — that lives on the reader (F7)', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    expect(screen.queryByText(/Webtoon/i)).toBeNull();
    expect(screen.queryByText(/Sens de lecture/i)).toBeNull();
  });

  it('hand-styles no button colour — the fill always comes from a shared class', async () => {
    renderPage();
    await screen.findByText('Ch. 2 · 4 planches');
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.getAttribute('style') ?? '').not.toMatch(/background|(^|[^-])color/);
    }
    // The header CTA is the only filled button on the screen, and it uses the shared intent class.
    expect(screen.getByRole('button', { name: /Publier/ }).className).toContain('ep-btn-primary');
  });
});
