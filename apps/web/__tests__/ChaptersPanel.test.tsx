import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChapterDto, ChapterListResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getProjectChapters: vi.fn(),
  createChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
}));

import * as api from '../lib/api';
import ChaptersPanel from '../components/projet/ChaptersPanel';

function chapter(over: Partial<ChapterDto> = {}): ChapterDto {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    title: 'Prologue — L’orage',
    number: 0,
    resume: 'Sous l’orage, Rin découvre le sanctuaire abandonné.',
    status: 'publie',
    progressPct: 100,
    targetPages: 2,
    plancheCount: 2,
    likeCount: 2100,
    hasCover: true, // CS-6 — the chapter opens on a cover (its first page)
    pages: [
      { id: 'p1', title: 'Page 1', stage: 'valide', thumbnailUrl: null, fileTags: [], position: 0 },
      { id: 'p2', title: 'Page 2', stage: 'nemu', thumbnailUrl: null, fileTags: [], position: 1 },
    ],
    ...over,
  };
}

function pageRef(over: Partial<ChapterDto['pages'][number]> = {}): ChapterDto['pages'][number] {
  return { id: 'p1', title: 'Page 1', stage: 'valide', thumbnailUrl: null, fileTags: [], position: 0, ...over };
}

/** The strip tile framing a given card — found by its image, or by its sr-only label when placeholder. */
function tileFor(name: string): HTMLElement {
  const labelled = screen.queryByRole('img', { name }) ?? screen.getByText(name);
  const tile = labelled.closest('.ep-chapter-thumb');
  if (!tile) throw new Error(`no strip tile for « ${name} »`);
  return tile as HTMLElement;
}

function listResponse(chapters: ChapterDto[], canWrite = true): ChapterListResponse {
  return { chapters, canWrite };
}

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getProjectChapters.mockResolvedValue(listResponse([chapter()]));
});

describe('ChaptersPanel', () => {
  it('renders one accordion item per chapter with the mapped status pill and meta line', async () => {
    mocked.getProjectChapters.mockResolvedValue(
      listResponse([
        chapter(),
        chapter({ id: 'ch-2', title: 'Ch. 2 — La rencontre', number: 2, status: 'en_cours', progressPct: 42, targetPages: 43, plancheCount: 18, likeCount: 0, pages: [] }),
      ]),
    );
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    expect(await screen.findByText('Prologue — L’orage')).toBeInTheDocument();
    expect(screen.getByText('Publié')).toBeInTheDocument();
    expect(screen.getByText('En cours · 42%')).toBeInTheDocument();
    expect(screen.getByText(/2 planches/)).toBeInTheDocument();
    expect(screen.getByText('2,1k')).toBeInTheDocument();
    expect(screen.getByText(/18 planches/)).toBeInTheDocument();
  });

  it('toggles aria-expanded on the accordion header button', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    const header = await screen.findByRole('button', { name: /Prologue/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Nouvelle page/ })).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  // ── R6-1/R6-2 · the strip draws the real planche, and a double at double width ──
  describe('page-thumbnail strip', () => {
    async function openStrip(pages: ChapterDto['pages']) {
      const user = userEvent.setup();
      mocked.getProjectChapters.mockResolvedValue(listResponse([chapter({ pages, plancheCount: pages.length })]));
      render(<ChaptersPanel slug="lames-de-brume" canWrite />);
      await user.click(await screen.findByRole('button', { name: /Prologue/ }));
      return user;
    }

    it('renders the linked page file as an <img> named after the card (R6-1c/e)', async () => {
      await openStrip([pageRef({ title: 'Page 7', thumbnailUrl: 'https://cdn.test/p7.webp' })]);
      const img = screen.getByRole('img', { name: 'Page 7' });
      expect(img).toHaveAttribute('src', 'https://cdn.test/p7.webp');
      expect(img).toHaveStyle({ objectFit: 'cover' });
      // The 2px ink frame and the number badge survive the image (R6-1c).
      expect(tileFor('Page 7')).toHaveStyle({ borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--ink)', borderRadius: '4px' });
      expect(within(tileFor('Page 7')).getByText('1')).toBeInTheDocument();
    });

    it('keeps the halftone placeholder for a card with no page file (R6-1d)', async () => {
      await openStrip([pageRef({ title: 'Page 7' })]);
      expect(screen.queryByRole('img', { name: 'Page 7' })).not.toBeInTheDocument();
      expect(tileFor('Page 7')).toBeInTheDocument();
    });

    it('falls back to the placeholder when the image fails, never a broken frame (R6-1d)', async () => {
      await openStrip([pageRef({ title: 'Page 7', thumbnailUrl: 'https://cdn.test/gone.webp' })]);
      fireEvent.error(screen.getByRole('img', { name: 'Page 7' }));
      await waitFor(() => expect(screen.queryByRole('img', { name: 'Page 7' })).not.toBeInTheDocument());
      expect(tileFor('Page 7')).toHaveStyle({ borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--ink)' });
    });

    // R6-2 — the 2× width now lives in the stylesheet (`.ep-chapter-thumb--double`) so the ≤480px
    // override cannot squash a spread back to one tile. The e2e measures the real pixels.
    it('marks a « double » card as a 2×-wide tile — placeholder as well as image (R6-2)', async () => {
      await openStrip([
        pageRef({ id: 'p1', title: 'Page 7', fileTags: ['double'] }),
        pageRef({ id: 'p2', title: 'Page 8', fileTags: ['double'], thumbnailUrl: 'https://cdn.test/p8.webp' }),
        pageRef({ id: 'p3', title: 'Page 9' }),
      ]);
      expect(tileFor('Page 7')).toHaveClass('ep-chapter-thumb--double');
      expect(tileFor('Page 8')).toHaveClass('ep-chapter-thumb--double');
      expect(tileFor('Page 9')).not.toHaveClass('ep-chapter-thumb--double');
    });

    // ── R8-1 · a double IS two pages, so it occupies two slots and the numbering shifts ──
    it('numbers the tiles, a « double » showing BOTH pages it represents', async () => {
      await openStrip([
        pageRef({ id: 'p1', title: 'Page 1' }),
        pageRef({ id: 'p2', title: 'Page 2', fileTags: ['double'] }),
        pageRef({ id: 'p3', title: 'Page 3' }),
      ]);
      expect(within(tileFor('Page 1')).getByText('1')).toBeInTheDocument();
      expect(within(tileFor('Page 2')).getByText('2-3')).toBeInTheDocument();
      expect(within(tileFor('Page 3')).getByText('4')).toBeInTheDocument();
    });

    it('draws a centre rule on a double so the wide tile reads as two slots', async () => {
      await openStrip([pageRef({ id: 'p1', title: 'Page 1', fileTags: ['double'] }), pageRef({ id: 'p2', title: 'Page 2' })]);
      expect(tileFor('Page 1').querySelector('[data-double-rule]')).toBeInTheDocument();
      expect(tileFor('Page 2').querySelector('[data-double-rule]')).toBeNull();
    });

    // ── R8-2 · drag a tile to place it. Same optimistic-then-revert shape as the board's moveCard ──
    async function dragOnto(from: string, to: string) {
      const data = new Map<string, string>();
      const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '' };
      fireEvent.dragStart(tileFor(from), { dataTransfer });
      fireEvent.dragOver(tileFor(to), { dataTransfer });
      fireEvent.drop(tileFor(to), { dataTransfer });
    }

    /** The strip's cards in drawn order. A tile reads "<title><badge>", e.g. "Page 31" = Page 3 · 1. */
    const order = (titles = ['Page 1', 'Page 2', 'Page 3']) =>
      [...document.querySelectorAll('.ep-chapter-thumb')].map((t) => titles.find((n) => t.textContent?.startsWith(n)));

    it('slides the held card into the previewed slot instead of leaving it in place', async () => {
      await openStrip([
        pageRef({ id: 'p1', title: 'Page 1' }),
        pageRef({ id: 'p2', title: 'Page 2', position: 1 }),
        pageRef({ id: 'p3', title: 'Page 3', position: 2 }),
      ]);
      const data = new Map<string, string>();
      const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '' };

      fireEvent.dragStart(tileFor('Page 3'), { dataTransfer });
      expect(tileFor('Page 3')).toHaveAttribute('data-dragging');

      // Hovering Page 1 moves the HELD card there, and the numbering follows what is drawn.
      fireEvent.dragOver(tileFor('Page 1'), { dataTransfer });
      expect(order()).toEqual(['Page 3', 'Page 1', 'Page 2']);
      expect(within(tileFor('Page 3')).getByText('1')).toBeInTheDocument();

      // Hovering further along slides it again — no commit until the drop.
      fireEvent.dragOver(tileFor('Page 2'), { dataTransfer });
      expect(order()).toEqual(['Page 1', 'Page 2', 'Page 3']);
      expect(mocked.updatePage).not.toHaveBeenCalled();

      // Abandoning the drag restores the real order.
      fireEvent.dragOver(tileFor('Page 1'), { dataTransfer });
      fireEvent.dragEnd(tileFor('Page 3'), { dataTransfer });
      expect(order()).toEqual(['Page 1', 'Page 2', 'Page 3']);
      expect(tileFor('Page 3')).not.toHaveAttribute('data-dragging');
    });

    it('sends the dropped card its new 1-based slot and reorders the strip immediately', async () => {
      mocked.updatePage.mockResolvedValue({});
      await openStrip([
        pageRef({ id: 'p1', title: 'Page 1' }),
        pageRef({ id: 'p2', title: 'Page 2' }),
        pageRef({ id: 'p3', title: 'Page 3', position: 2 }),
      ]);
      await dragOnto('Page 3', 'Page 1');
      await waitFor(() => expect(mocked.updatePage).toHaveBeenCalledWith('p3', { position: 1 }));
      // Optimistic: the badge follows the new order before any refetch.
      expect(within(tileFor('Page 3')).getByText('1')).toBeInTheDocument();
      expect(within(tileFor('Page 1')).getByText('2')).toBeInTheDocument();
    });

    it('reverts the strip and warns when the placement fails', async () => {
      mocked.updatePage.mockRejectedValue(new Error('500'));
      await openStrip([pageRef({ id: 'p1', title: 'Page 1' }), pageRef({ id: 'p2', title: 'Page 2', position: 1 })]);
      await dragOnto('Page 2', 'Page 1');
      expect(await screen.findByRole('alert')).toHaveTextContent('La réorganisation a échoué. Réessayez.');
      expect(within(tileFor('Page 1')).getByText('1')).toBeInTheDocument();
    });

    it('captions the strip and says the tiles can be dragged (prototype copy)', async () => {
      await openStrip([pageRef({ id: 'p1', title: 'Page 1' }), pageRef({ id: 'p2', title: 'Page 2', position: 1 })]);
      expect(screen.getByText('PAGES')).toBeInTheDocument();
      expect(screen.getByText(/glisser pour réordonner/)).toBeInTheDocument();
    });

    it('does not promise drag & drop to a viewer without « Écriture »', async () => {
      const user = userEvent.setup();
      mocked.getProjectChapters.mockResolvedValue(listResponse([chapter({ pages: [pageRef()] })], false));
      render(<ChaptersPanel slug="lames-de-brume" canWrite={false} />);
      await user.click(await screen.findByRole('button', { name: /Prologue/ }));
      expect(screen.getByText('PAGES')).toBeInTheDocument();
      expect(screen.queryByText(/glisser pour réordonner/)).toBeNull();
    });

    it('does not make the tiles draggable without « Écriture »', async () => {
      const user = userEvent.setup();
      mocked.getProjectChapters.mockResolvedValue(listResponse([chapter({ pages: [pageRef()] })], false));
      render(<ChaptersPanel slug="lames-de-brume" canWrite={false} />);
      await user.click(await screen.findByRole('button', { name: /Prologue/ }));
      expect(tileFor('Page 1')).not.toHaveAttribute('draggable', 'true');
    });
  });

  it('shows "Aucune page liée" when the chapter has no linked page', async () => {
    const user = userEvent.setup();
    mocked.getProjectChapters.mockResolvedValue(listResponse([chapter({ pages: [], plancheCount: 0 })]));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: /Prologue/ }));
    expect(screen.getByText('Aucune page liée')).toBeInTheDocument();
  });

  it('saves the inline edit form with the edited title / number / résumé', async () => {
    const user = userEvent.setup();
    mocked.updateChapter.mockResolvedValue(chapter({ title: 'Prologue bis', number: 3 }));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    const title = screen.getByLabelText('TITRE');
    await user.clear(title);
    await user.type(title, 'Prologue bis');
    const number = screen.getByLabelText('N°');
    await user.clear(number);
    await user.type(number, '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(mocked.updateChapter).toHaveBeenCalledWith('ch-1', {
        title: 'Prologue bis',
        number: 3,
        resume: 'Sous l’orage, Rin découvre le sanctuaire abandonné.',
        targetPages: 2, // R2-7 — carried through untouched by this edit
      }),
    );
    expect(await screen.findByText('Prologue bis')).toBeInTheDocument();
  });

  it('"Annuler" closes the form and reverts the fields without any request', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.clear(screen.getByLabelText('TITRE'));
    await user.type(screen.getByLabelText('TITRE'), 'jeté');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(mocked.updateChapter).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('TITRE')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByLabelText('TITRE')).toHaveValue('Prologue — L’orage');
  });

  it('requires a title before calling the API', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.clear(screen.getByLabelText('TITRE'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Le titre est obligatoire.')).toBeInTheDocument();
    expect(mocked.updateChapter).not.toHaveBeenCalled();
  });

  // ── R3-2 · the percentage is ALWAYS shown (reverses R2-7c) ────────────────
  it('shows a percentage even for a chapter nobody planned by hand (default 20)', async () => {
    mocked.getProjectChapters.mockResolvedValue(
      listResponse([chapter({ status: 'en_cours', progressPct: 0, targetPages: 20 })]),
    );
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    expect(await screen.findByText('En cours · 0%')).toBeInTheDocument();
  });

  // R2-8a — at 100 % the pill becomes « Terminé » (accent fill, white text). It deliberately shares
  // its look with « ✓ Publié »: different states, distinguished by the label and the check icon.
  it('shows « Terminé » instead of a percentage once the target is reached', async () => {
    mocked.getProjectChapters.mockResolvedValue(
      listResponse([chapter({ status: 'en_cours', progressPct: 100, targetPages: 12 })]),
    );
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    const pill = await screen.findByText('Terminé');
    expect(pill).toBeInTheDocument();
    expect(screen.queryByText(/En cours/)).not.toBeInTheDocument();
    expect(pill).toHaveStyle({ background: 'var(--accent)', color: '#fff' });
  });

  it('saves « PLANCHES PRÉVUES » with the rest of the edit form', async () => {
    const user = userEvent.setup();
    mocked.updateChapter.mockResolvedValue(chapter({ targetPages: 24 }));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    const target = screen.getByLabelText('PLANCHES PRÉVUES');
    await user.clear(target);
    await user.type(target, '24');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mocked.updateChapter).toHaveBeenCalledWith('ch-1', expect.objectContaining({ targetPages: 24 })));
  });

  // R3-2 reverses R2-7d's "empty clears it": the column is NOT NULL, so there is nothing to clear to.
  it('refuses to save an emptied « PLANCHES PRÉVUES »', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.clear(screen.getByLabelText('PLANCHES PRÉVUES'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Indiquez un entier positif.')).toBeInTheDocument();
    expect(mocked.updateChapter).not.toHaveBeenCalled();
  });

  // R2-4 — QA measured a ~175px dead gap at ≤768px: the TITRE wrapper's inline `flex: 1 1 240px`
  // keeps its 240px basis as a HEIGHT once the media query switches the row to column direction.
  // The basis has to live in CSS so the column-direction rule can reset it; an inline `flex` here
  // would be unresettable, so guard against it coming back.
  it('keeps the TITRE field basis in CSS, not inline (resettable in column layout)', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));

    const wrapper = screen.getByLabelText('TITRE').parentElement as HTMLElement;
    expect(wrapper).toHaveClass('ep-chapter-title-field');
    expect(wrapper.style.flex).toBe('');
    expect(wrapper.style.flexBasis).toBe('');
  });

  it('surfaces the server 409 as a number-collision warning next to N°', async () => {
    const user = userEvent.setup();
    mocked.updateChapter.mockRejectedValue({ statusCode: 409, message: 'Le numéro 3 est déjà utilisé par un autre chapitre.' });
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.clear(screen.getByLabelText('N°'));
    await user.type(screen.getByLabelText('N°'), '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Le numéro 3 est déjà utilisé par un autre chapitre.');
    expect(screen.getByLabelText('N°')).toHaveAttribute('aria-invalid', 'true');
  });

  it('adds a chapter from "＋ Ajouter un chapitre"', async () => {
    const user = userEvent.setup();
    mocked.createChapter.mockResolvedValue(chapter({ id: 'ch-new', title: 'Ch. 3', number: 3, pages: [], plancheCount: 0 }));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: '＋ Ajouter un chapitre' }));
    await user.type(screen.getByLabelText('TITRE'), 'Ch. 3');
    await user.clear(screen.getByLabelText('N°'));
    await user.type(screen.getByLabelText('N°'), '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(mocked.createChapter).toHaveBeenCalledWith('lames-de-brume', {
        title: 'Ch. 3',
        number: 3,
        resume: '',
        targetPages: 20, // R3-2 — the add form starts pre-filled with the default planned length
      }),
    );
    expect(await screen.findByText('Ch. 3')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting an EMPTY chapter, then calls DELETE', async () => {
    const user = userEvent.setup();
    mocked.getProjectChapters.mockResolvedValue(listResponse([chapter({ pages: [], plancheCount: 0 })]));
    mocked.deleteChapter.mockResolvedValue(undefined);
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer le chapitre' }));
    expect(mocked.deleteChapter).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(mocked.deleteChapter).toHaveBeenCalledWith('ch-1'));
    await waitFor(() => expect(screen.queryByText('Prologue — L’orage')).not.toBeInTheDocument());
  });

  // R2-6: a chapter that still holds cards cannot be deleted — the dialog states the blocker
  // instead of offering a destroy that would 409, and no request is fired.
  it('blocks deletion of a non-empty chapter and explains why', async () => {
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer le chapitre' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Ce chapitre contient 2 cartes — déplacez-les ou supprimez-les d’abord.');
    expect(within(dialog).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(mocked.deleteChapter).not.toHaveBeenCalled();
  });

  // R5-5 — the dashed tile CREATES a page in this chapter (it used to open a link picker, which
  // under R2-1d could only ever MOVE another chapter's page here). Same create path as the board's
  // « ＋ Ajouter une carte »; no new route, and no picker left to open.
  it('creates a page in this chapter from the dashed tile', async () => {
    const user = userEvent.setup();
    mocked.createPage.mockResolvedValue({ id: 'p9', chapterId: 'ch-1', title: 'Page 3', stage: 'scenario', fileTags: [] });
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: /Prologue/ }));

    expect(screen.queryByRole('button', { name: /Lier une page/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nouvelle page/ }));

    expect(mocked.createPage).toHaveBeenCalledWith('lames-de-brume', { chapterId: 'ch-1' });
    // …and it joins the strip, without opening any dialog.
    expect(await screen.findByText('Page 3')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/3 planches/)).toBeInTheDocument());
  });

  it('reports a failed page creation on the strip', async () => {
    const user = userEvent.setup();
    mocked.createPage.mockRejectedValue(new Error('nope'));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    await user.click(await screen.findByRole('button', { name: /Prologue/ }));
    await user.click(screen.getByRole('button', { name: /Nouvelle page/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
  });

  it('renders the empty state when the project has no chapter yet', async () => {
    mocked.getProjectChapters.mockResolvedValue(listResponse([]));
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    expect(await screen.findByText('Aucun chapitre pour le moment')).toBeInTheDocument();
  });

  it('renders the loading then the error state', async () => {
    mocked.getProjectChapters.mockRejectedValue({ statusCode: 500, message: 'boom' });
    render(<ChaptersPanel slug="lames-de-brume" canWrite />);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    expect(await screen.findByText('Impossible de charger les chapitres.')).toBeInTheDocument();
  });

  it('hides every write affordance when the viewer has no « Écriture »', async () => {
    mocked.getProjectChapters.mockResolvedValue(listResponse([chapter()], false));
    const user = userEvent.setup();
    render(<ChaptersPanel slug="lames-de-brume" canWrite={false} />);

    await user.click(await screen.findByRole('button', { name: /Prologue/ }));
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '＋ Ajouter un chapitre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouvelle page/ })).not.toBeInTheDocument();
    // the list itself stays readable
    expect(screen.getByText('Prologue — L’orage')).toBeInTheDocument();
  });
});
