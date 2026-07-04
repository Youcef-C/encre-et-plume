import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkDetail, WorkChaptersResponse, ChapterPagesResponse, AccountSummary } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getWork: vi.fn(),
    getWorkChapters: vi.fn(),
    getChapterPages: vi.fn(),
    getMyFavorites: vi.fn(),
    putReadingProgress: vi.fn(),
    getReactionState: vi.fn().mockResolvedValue({}),
    likeReaction: vi.fn(),
    unlikeReaction: vi.fn(),
    saveReaction: vi.fn(),
    unsaveReaction: vi.fn(),
  };
});

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

let sessionAccount: AccountSummary | null = null;
vi.mock('../lib/session', () => ({ useSession: () => ({ account: sessionAccount, loading: false }) }));

import * as api from '../lib/api';
import Reader from '../components/lecteur/Reader';
import { MANGA_PAGE_RATIO, ROMAN_PAGE_RATIO } from '../components/lecteur/Stage';

const work: WorkDetail = {
  id: 'w1',
  slug: 'lames-de-brume',
  title: 'Lames de Brume',
  cover: null,
  genre: 'Seinen',
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
  team: [],
  fundingGoals: [],
  reviews: [],
};

const chaptersResponse: WorkChaptersResponse = {
  items: [
    { id: 'ch-1', number: 1, title: 'Sous la pluie', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 1800, locked: false, lockReason: null },
    { id: 'ch-4', number: 4, title: null, plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 100, locked: true, lockReason: 'premium' },
  ],
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const mangaPages: ChapterPagesResponse = {
  workSlug: 'lames-de-brume',
  chapterNumber: 1,
  readMode: 'pages',
  totalPages: 6,
  pages: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, image: null, caption: i === 2 ? '« Alors prouve-le. »' : null, double: false })),
  prose: [],
};

const romanPages: ChapterPagesResponse = {
  workSlug: 'dr2-le-murmure-des-cendres',
  chapterNumber: 1,
  readMode: 'prose',
  totalPages: 2,
  pages: [],
  prose: ['Paragraphe un.', 'Paragraphe deux.', 'Paragraphe trois.', 'Paragraphe quatre.', 'Paragraphe cinq.', 'Paragraphe six.'],
};

const account: AccountSummary = { id: 'a1', slug: 'camille', displayName: 'Camille', role: 'utilisateur', verified: true } as AccountSummary;

function mockReady() {
  vi.mocked(api.getWork).mockResolvedValue(work);
  vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
  vi.mocked(api.getChapterPages).mockResolvedValue(mangaPages);
  vi.mocked(api.getMyFavorites).mockResolvedValue([]);
  vi.mocked(api.putReadingProgress).mockResolvedValue(undefined);
  vi.mocked(api.getReactionState).mockResolvedValue({});
}

describe('Reader (DR-4 FE-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAccount = null;
    searchParams = new URLSearchParams('');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading status, then the dark stage with topbar/asides/stage once ready', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    expect(screen.getByRole('status', { name: /Chargement/i })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/Lames de Brume · Ch\. 1/)).toBeInTheDocument());
    expect(screen.getByText("‹ Retour à l'œuvre")).toBeInTheDocument();
    expect(screen.getByText('Chapitres')).toBeInTheDocument();
    expect(screen.getByText('Réactions')).toBeInTheDocument();
    expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument();
    expect(screen.getByText('4 · — verrouillé ★')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6'));
  });

  it('QA F1 fix (round 2): "✕ Quitter" is a normal flex child of the topbar\'s tool row, not position:fixed/absolute — it must be structurally impossible for it to overlap a sibling or the site header', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText('✕ Quitter').closest('a')).toBeInTheDocument());
    const exitLink = screen.getByText('✕ Quitter').closest('a') as HTMLAnchorElement;
    const fullscreenBtn = screen.getByRole('button', { name: /plein écran/i });

    // No fixed/absolute coordinate at all - normal document flow (flex-wrap row).
    expect(exitLink.style.position).not.toBe('fixed');
    expect(exitLink.style.position).not.toBe('absolute');
    expect(exitLink).toHaveAttribute('href', '/oeuvre/lames-de-brume');

    // Structural, not positional: it is a sibling of "Plein écran" in the same flex-wrap
    // container, so overlap is impossible by layout construction, not by coordinate luck.
    expect(exitLink.parentElement).toBe(fullscreenBtn.parentElement);
  });

  // Story update (2026-07-04): the topbar back control returns to the current work's page, not
  // the catalogue (overrides the prototype's "‹ Catalogue" link). "✕ Quitter" already covered by
  // the QA F1 test above resolves to the same /oeuvre/{slug} destination as a distinct "quit
  // reading" action - this is the one breadcrumb-style back affordance.
  it('the back link returns to the current work\'s page, not the catalogue', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText("‹ Retour à l'œuvre").closest('a')).toBeInTheDocument());
    const backLink = screen.getByText("‹ Retour à l'œuvre").closest('a') as HTMLAnchorElement;
    expect(backLink).toHaveAttribute('href', '/oeuvre/lames-de-brume');
  });

  it('never renders a Webtoon segment (F10 — no webtoon mode)', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByText('Pages')).toBeInTheDocument());
    expect(screen.queryByText('Webtoon')).not.toBeInTheDocument();
  });

  // Story update (2026-07-04): "Fixed page aspect ratio" - manga pages never stretch/crop; forced
  // to a fixed manga page ratio (~2:3 portrait).
  it('constrains manga pages to the manga page ratio (~2:3)', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
    const placeholder = screen.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' });
    const pageCard = placeholder.parentElement as HTMLElement;
    expect(pageCard.style.aspectRatio).toBe(MANGA_PAGE_RATIO);
  });

  // QA BLOCKER (round 2): the ratio property alone doesn't prove the page actually renders large -
  // jsdom can't compute real layout, so a passing `aspectRatio` check hid a page collapsed to a
  // ~34x51px stamp. QA traced it further: giving only the WRAPPER a definite width/height was
  // necessary but not sufficient - the page CARD itself still had just `maxWidth`/`maxHeight`
  // (caps, not values), so it fell back to content-based (min-content) sizing regardless of the
  // wrapper's size. The fix (mirroring `RomanPageSurface`, which already worked this way) gives
  // the card itself an explicit, definite `height:'100%'` and lets `width` derive from
  // rendered pixel size is verified in e2e/reader.spec.ts (jsdom can't measure real layout).
  it('BLOCKER FIX: the page card contain-sizes (aspect-ratio + maxHeight:100%) against the viewport-anchored stage, so it cannot fall back to min-content', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
    const placeholder = screen.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' });
    const pageCard = placeholder.parentElement as HTMLElement;
    const wrapper = pageCard.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe('100%');
    expect(wrapper.style.height).toBe('100%');
    // Single-page (default) is height-driven: height:100% is the definite dimension aspect-ratio
    // resolves width from, against the now viewport-anchored definite-height stage. (Double-page
    // switches to width-driven — verified by the side-by-side geometry test in e2e/reader.spec.ts.)
    expect(pageCard.style.aspectRatio).toBe('2 / 3');
    expect(pageCard.style.height).toBe('100%');
    expect(pageCard.style.width).toBe('auto');
    expect(pageCard.style.maxWidth).toBe('100%');
  });

  // QA Finding A (user-reported: "Réactions gets squished to the bottom" with a 2-page spread
  // open): the middle stage column previously used `flex:'1 1 auto'`, whose hypothetical main
  // size came from its own (large, double-page) content BEFORE flex-shrink negotiation - large
  // enough alone to exceed the leftover row width, forcing `.ep-reader-columns`' flex-wrap to
  // split the asides onto separate stacked lines. `flex:'1 1 0'` makes ordinary flex-grow space
  // distribution give the column the row's real leftover width instead, keeping the row a single
  // 3-column line. Real cross-column geometry (asides staying docked left/right, not wrapping
  // below the stage) needs real layout and is verified in e2e/reader.spec.ts.
  it('Finding A fix: the stage column/area use the viewport-anchored reader classes so a double-page spread cannot force the asides to wrap away or collapse the page', async () => {
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
    const placeholder = screen.getByRole('img', { name: 'Lames de Brume — chapitre 1, page 1' });
    const pageCard = placeholder.parentElement as HTMLElement;
    const wrapper = pageCard.parentElement as HTMLElement;
    // Structure: MangaPages wrapper → .ep-reader-stagearea (flex:1, definite height) →
    // .ep-reader-stagecol (flex:1 1 0). The flex/height values live in globals.css (jsdom
    // doesn't apply them); real cross-column geometry + page size are verified in
    // e2e/reader.spec.ts. Here we pin the structural contract that drives that CSS.
    const stageArea = wrapper.parentElement as HTMLElement;
    const stageCol = stageArea.parentElement as HTMLElement;
    expect(stageArea).toHaveClass('ep-reader-stagearea');
    expect(stageCol).toHaveClass('ep-reader-stagecol');
  });

  // Story update (2026-07-04, States bullet): the 2-page spread is now ENABLED for roman too
  // (previously disabled/locked for prose) - two A4 surfaces side by side.
  it('enables the spread toggle for a roman (prose) chapter and renders a 2-page spread', async () => {
    vi.mocked(api.getWork).mockResolvedValue({ ...work, format: 'Roman' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockResolvedValue(romanPages);
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Reader slug="dr2-le-murmure-des-cendres" />);
    await waitFor(() => expect(screen.getByRole('button', { name: '2 pages' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '2 pages' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '1 page' })).not.toBeDisabled();
    expect(screen.getByText('Paragraphe un.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2 pages' }));
    // First page's paragraphs (1-5) and the second page's paragraphs (6-10) both visible at once.
    expect(screen.getByText('Paragraphe un.')).toBeInTheDocument();
    expect(screen.getByText('Paragraphe six.')).toBeInTheDocument();
  });

  // Story update: "◳ Studio" repurposed into a "clear view" toggle - collapses both side asides
  // for a bigger, distraction-free panel, distinct from full immersive fullscreen (the topbar
  // itself must stay visible, unlike the "Plein écran" mode which unmounts it entirely).
  describe('"Vue dégagée" (Studio clear-view toggle)', () => {
    it('collapses both asides while keeping the topbar chrome visible, and restores them on a second click', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      // "1 · Sous la pluie" (a chapter row) only renders in the EXPANDED aside - the collapsed
      // mini-rail still shows a vertical "Chapitres"/"Réactions" label, so that text alone can't
      // distinguish expanded vs. collapsed; the "Développer" button is collapsed-only.
      await waitFor(() => expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Développer' })).not.toBeInTheDocument();

      const studioBtn = screen.getByRole('button', { name: 'Vue dégagée' });
      expect(studioBtn).toHaveAttribute('aria-pressed', 'false');

      await user.click(studioBtn);
      expect(studioBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText('1 · Sous la pluie')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Développer' })).toHaveLength(2);
      // Distinct from full immersive fullscreen: the topbar chrome is still here.
      expect(screen.getByText("‹ Retour à l'œuvre")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Passer en plein écran' })).toBeInTheDocument();

      await user.click(studioBtn);
      expect(studioBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Développer' })).not.toBeInTheDocument();
    });

    it('is keyboard-operable (Tab + Enter)', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument());

      const studioBtn = screen.getByRole('button', { name: 'Vue dégagée' });
      studioBtn.focus();
      expect(studioBtn).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(studioBtn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText('1 · Sous la pluie')).not.toBeInTheDocument();
    });
  });

  // Story update (2026-07-04): "Fixed page aspect ratio" - roman prose pages are constrained to
  // an A4-proportioned page surface (1:√2).
  it('constrains roman prose pages to the A4 ratio (1:1.414)', async () => {
    vi.mocked(api.getWork).mockResolvedValue({ ...work, format: 'Roman' });
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockResolvedValue(romanPages);
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    render(<Reader slug="dr2-le-murmure-des-cendres" />);
    await waitFor(() => expect(screen.getByText('Paragraphe un.')).toBeInTheDocument());
    const pageSurface = screen.getByText('Paragraphe un.').closest('div') as HTMLElement;
    expect(pageSurface.style.aspectRatio).toBe(ROMAN_PAGE_RATIO);
  });

  it('shows an error card with a working retry when the pages fetch fails', async () => {
    vi.mocked(api.getWork).mockResolvedValue(work);
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockRejectedValueOnce({ statusCode: 500, message: 'Erreur serveur' });
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(api.getChapterPages).mockResolvedValueOnce(mangaPages);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
  });

  it('opens the paywall automatically for a deep link to a locked chapter (403)', async () => {
    searchParams = new URLSearchParams('chapitre=4');
    vi.mocked(api.getWork).mockResolvedValue(work);
    vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
    vi.mocked(api.getChapterPages).mockRejectedValue({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' });
    vi.mocked(api.getMyFavorites).mockResolvedValue([]);
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Chapitre verrouillé/ })).toBeInTheDocument());
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('persists reading progress (debounced) for a signed-in reader once pages are ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionAccount = account;
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(api.putReadingProgress).toHaveBeenCalledWith({ workSlug: 'lames-de-brume', chapterNumber: 1, page: 1 });
  });

  it('does not persist reading progress for a signed-out reader', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sessionAccount = null;
    mockReady();
    render(<Reader slug="lames-de-brume" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(api.putReadingProgress).not.toHaveBeenCalled();
  });

  describe('DR-11 F-d — honors the ?page= deep link', () => {
    const chapter4Pages: ChapterPagesResponse = {
      workSlug: 'lames-de-brume',
      chapterNumber: 4,
      readMode: 'pages',
      totalPages: 28,
      pages: Array.from({ length: 28 }, (_, i) => ({ index: i + 1, image: null, caption: null, double: false })),
      prose: [],
    };
    const chaptersWithTwoUnlocked: WorkChaptersResponse = {
      ...chaptersResponse,
      items: [
        chaptersResponse.items[0],
        { id: 'ch-2', number: 2, title: 'Le silence', plancheCount: 6, publishedAt: '2024-03-14T00:00:00.000Z', likeCount: 90, locked: false, lockReason: null },
      ],
    };

    it('starts at the deep-linked page on the initial chapter', async () => {
      searchParams = new URLSearchParams('chapitre=4&page=12');
      vi.mocked(api.getWork).mockResolvedValue(work);
      vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersResponse);
      vi.mocked(api.getChapterPages).mockResolvedValue(chapter4Pages);
      vi.mocked(api.getMyFavorites).mockResolvedValue([]);
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 12 sur 28'));
    });

    it('clamps a deep-linked page beyond totalPages to totalPages', async () => {
      searchParams = new URLSearchParams('chapitre=1&page=999');
      mockReady();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 6 sur 6'));
    });

    it('resets to page 1 when switching to another chapter', async () => {
      searchParams = new URLSearchParams('chapitre=1&page=3');
      vi.mocked(api.getWork).mockResolvedValue(work);
      vi.mocked(api.getWorkChapters).mockResolvedValue(chaptersWithTwoUnlocked);
      vi.mocked(api.getChapterPages).mockResolvedValue(mangaPages);
      vi.mocked(api.getMyFavorites).mockResolvedValue([]);
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 3 sur 6'));

      await user.click(screen.getByText('2 · Le silence'));
      await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6'));
    });
  });

  // Story update (2026-07-04): "Plein écran" is now a real immersive mode, not just a native
  // Fullscreen API call. jsdom never implements requestFullscreen/exitFullscreen, so every
  // click here exercises the degraded ("Fullscreen API unavailable") path by construction —
  // exactly the path the story calls out as the one that must still work, driven purely off the
  // `fullscreen` React state rather than `document.fullscreenElement`.
  describe('Plein écran (immersive) mode', () => {
    it('hides the topbar and both asides, and shows a minimal bottom bar with page nav + favorites switch + chapter switch + exit control', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Passer en plein écran' }));

      expect(screen.queryByText("‹ Retour à l'œuvre")).not.toBeInTheDocument();
      expect(screen.queryByText('Chapitres')).not.toBeInTheDocument();
      expect(screen.queryByText('Réactions')).not.toBeInTheDocument();

      const bar = screen.getByRole('toolbar', { name: /plein écran/i });
      expect(within(bar).getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 1 sur 6');
      expect(within(bar).getByRole('button', { name: /Favoris/ })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: /Ch\. 1/ })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Quitter le plein écran' })).toBeInTheDocument();
    });

    // QA (round 2): the bar previously reserved its own layout height as a flex sibling, so the
    // stage only ever filled ~91% desktop / ~77% mobile, and hiding the bar didn't grow the
    // stage back. Fixed by making the bar overlay the stage instead of taking flow height.
    it('overlays the stage instead of reserving layout height (stage content fills the container; bar is a positioned overlay, not a flex sibling)', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Passer en plein écran' }));

      const stageContent = screen.getByTestId('fullscreen-stage');
      expect(stageContent.style.position).toBe('absolute');
      expect(stageContent.style.inset).toBe('0');

      const bar = screen.getByRole('toolbar', { name: /plein écran/i });
      expect(bar.style.position).toBe('absolute');
      expect(bar.style.bottom).toBe('0px');
      // Not a flex child taking its own row height alongside the stage content.
      expect(bar.style.flex).toBe('');
    });

    it('exiting fullscreen restores the full reader chrome exactly as before', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Passer en plein écran' }));
      expect(screen.queryByText('Chapitres')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Quitter le plein écran' }));
      expect(screen.getByText("‹ Retour à l'œuvre")).toBeInTheDocument();
      expect(screen.getByText('Chapitres')).toBeInTheDocument();
      expect(screen.getByText('Réactions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Passer en plein écran' })).toBeInTheDocument();
    });

    it('the favorites quick-switch inside the bottom bar lists favorites when signed in', async () => {
      sessionAccount = account;
      mockReady();
      vi.mocked(api.getMyFavorites).mockResolvedValue([{ slug: 'onibi', title: 'Onibi', cover: null, meta: 'Yuki M. · 8 ch.' }]);
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Passer en plein écran' }));

      const bar = screen.getByRole('toolbar', { name: /plein écran/i });
      await user.click(within(bar).getByRole('button', { name: /Favoris/ }));
      expect(screen.getByText('Onibi')).toBeInTheDocument();
    });

    it('the chapter quick-switch inside the bottom bar lists chapters (locked state included)', async () => {
      mockReady();
      const user = userEvent.setup();
      render(<Reader slug="lames-de-brume" />);
      await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Passer en plein écran' }));

      const bar = screen.getByRole('toolbar', { name: /plein écran/i });
      await user.click(within(bar).getByRole('button', { name: /Ch\. 1/ }));
      expect(screen.getByText('4 · — verrouillé ★')).toBeInTheDocument();
    });

    // Story update (2026-07-04): the bottom bar auto-hides after ~2.5-3s of no pointer
    // movement so the manga fills the screen uninterrupted, and re-reveals on
    // pointer move / key press / touch, never trapping a keyboard user mid-focus.
    describe('bottom bar auto-hide', () => {
      async function enterFullscreen() {
        mockReady();
        render(<Reader slug="lames-de-brume" />);
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Passer en plein écran' }));
        return screen.getByRole('toolbar', { name: /plein écran/i });
      }

      it('hides the bar after ~2.5-3s of no pointer movement', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const bar = await enterFullscreen();
        expect(bar).toHaveAttribute('data-hidden', 'false');

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(bar).toHaveAttribute('data-hidden', 'true');
      });

      it('re-reveals on pointer move and resets the idle timer', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const bar = await enterFullscreen();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(bar).toHaveAttribute('data-hidden', 'true');

        act(() => {
          document.dispatchEvent(new Event('pointermove'));
        });
        expect(bar).toHaveAttribute('data-hidden', 'false');

        // Timer was reset by the pointermove, not just paused — still visible partway through.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500);
        });
        expect(bar).toHaveAttribute('data-hidden', 'false');
      });

      it('re-reveals on keydown (a key press, not just the ArrowLeft/Right paging keys)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const bar = await enterFullscreen();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(bar).toHaveAttribute('data-hidden', 'true');

        act(() => {
          fireEvent.keyDown(document, { key: 'Tab' });
        });
        expect(bar).toHaveAttribute('data-hidden', 'false');
      });

      it('stays visible while a control inside the bar has keyboard focus, even past the idle timeout', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const bar = await enterFullscreen();
        act(() => {
          within(bar).getByRole('button', { name: /Favoris/ }).focus();
        });

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(bar).toHaveAttribute('data-hidden', 'false');
      });

      it('resumes auto-hide once focus leaves the bar', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const bar = await enterFullscreen();
        const favBtn = within(bar).getByRole('button', { name: /Favoris/ });
        act(() => {
          favBtn.focus();
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(bar).toHaveAttribute('data-hidden', 'false');

        // The idle timer already elapsed at 5s while masked by focus - blurring should reveal
        // that immediately, with no further wait needed (never "trap" a keyboard user, but also
        // never artificially keep the bar shown longer than the idle window once focus leaves).
        act(() => {
          favBtn.blur();
        });
        expect(bar).toHaveAttribute('data-hidden', 'true');
      });
    });
  });
});
