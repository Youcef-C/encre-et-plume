import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetItem, WorkspacePage } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  linkAssetToPage: vi.fn(),
  unlinkAssetFromPage: vi.fn(),
}));

import * as api from '../lib/api';
import LinkCardModal from '../components/projet/LinkCardModal';

function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg',
    chapterId: 'c1',
    title: 'Page',
    stage: 'scenario',
    position: 0,
    fileTags: [],
    linkedFileIds: [],
    linkedFiles: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    openCorrectionCount: 0,
    createdById: null, handoff: null, scenarioUnsaved: false,
    ...over,
  };
}

const asset: AssetItem = {
  id: 'a1',
  type: 'dessin',
  filename: 'ruelle-nemu.png',
  currentVersion: 1,
  size: 2_400_000,
  thumbnailUrl: null,
  previewable: true,
  linkedPages: [],
  updatedAt: '2026-07-13T10:00:00.000Z',
};

const pages = [
  makePage({ id: 'pg7', title: 'Page 7', stage: 'scenario' }),
  makePage({ id: 'pg6', title: 'Page 6', stage: 'nemu' }),
];

// R5-6a — resolved ONCE by FichiersPanel and passed down; the modal never re-derives the format.
const chapterLabels = new Map([
  ['c1', 'Prologue'],
  ['c2', 'Ch. 2'],
]);

describe('LinkCardModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists project cards and links the chosen one', async () => {
    const linked: AssetItem = { ...asset, linkedPages: [{ id: 'pg7', title: 'Page 7' }] };
    vi.mocked(api.linkAssetToPage).mockResolvedValue(linked);
    const onLinked = vi.fn();
    render(
      <LinkCardModal asset={asset} pages={pages} chapterLabels={chapterLabels} onClose={vi.fn()} onLinked={onLinked} />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Page 7')).toBeInTheDocument();
    expect(screen.getByText('Page 6')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Page 7/ }));

    await waitFor(() =>
      expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' }),
    );
    expect(onLinked).toHaveBeenCalledWith(linked);
  });

  it('toggles a card: click links (stays open, row selected), click again unlinks', async () => {
    // scenario = MULTI type, so cards toggle freely.
    const scenario: AssetItem = { ...asset, type: 'scenario', linkedPages: [] };
    const linked: AssetItem = { ...scenario, linkedPages: [{ id: 'pg7', title: 'Page 7' }] };
    vi.mocked(api.linkAssetToPage).mockResolvedValue(linked);
    vi.mocked(api.unlinkAssetFromPage).mockResolvedValue(scenario);
    const onClose = vi.fn();
    const onLinked = vi.fn();
    render(
      <LinkCardModal asset={scenario} pages={pages} chapterLabels={chapterLabels} onClose={onClose} onLinked={onLinked} />,
    );

    const row = () => screen.getByRole('button', { name: /Page 7/ });
    expect(row()).toHaveAttribute('aria-pressed', 'false');

    // Click links it — modal stays open, row becomes selected, grid gets the update.
    await userEvent.click(row());
    await waitFor(() => expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'pg7' }));
    expect(onLinked).toHaveBeenCalledWith(linked);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(row()).toHaveAttribute('aria-pressed', 'true'));

    // Click again unlinks it — row becomes unselected again.
    await userEvent.click(row());
    await waitFor(() => expect(api.unlinkAssetFromPage).toHaveBeenCalledWith('a1', 'pg7'));
    expect(onLinked).toHaveBeenLastCalledWith(scenario);
    await waitFor(() => expect(row()).toHaveAttribute('aria-pressed', 'false'));
  });

  it('multi type: several cards can be toggled on', async () => {
    const scenario: AssetItem = { ...asset, type: 'scenario', linkedPages: [] };
    vi.mocked(api.linkAssetToPage)
      .mockResolvedValueOnce({ ...scenario, linkedPages: [{ id: 'pg7', title: 'Page 7' }] })
      .mockResolvedValueOnce({
        ...scenario,
        linkedPages: [
          { id: 'pg7', title: 'Page 7' },
          { id: 'pg6', title: 'Page 6' },
        ],
      });
    render(<LinkCardModal asset={scenario} pages={pages} chapterLabels={chapterLabels} onClose={vi.fn()} onLinked={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Page 7/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Page 7/ })).toHaveAttribute('aria-pressed', 'true'),
    );
    await userEvent.click(screen.getByRole('button', { name: /Page 6/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Page 6/ })).toHaveAttribute('aria-pressed', 'true'),
    );
    // Both stay selected for a MULTI type.
    expect(screen.getByRole('button', { name: /Page 7/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes via the Terminé button', async () => {
    const onClose = vi.fn();
    render(<LinkCardModal asset={asset} pages={pages} chapterLabels={chapterLabels} onClose={onClose} onLinked={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<LinkCardModal asset={asset} pages={pages} chapterLabels={chapterLabels} onClose={onClose} onLinked={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty note when the project has no cards', () => {
    render(<LinkCardModal asset={asset} pages={[]} chapterLabels={chapterLabels} onClose={vi.fn()} onLinked={vi.fn()} />);
    expect(screen.getByText('Aucune carte dans ce projet.')).toBeInTheDocument();
  });

  // R5-6b — chapter-scoped numbering lets two cards share a title; the row names the chapter so the
  // user can tell which one they are linking to. Display only: still a link/unlink toggle.
  it('names each card’s chapter beside the stage, so same-titled cards are distinguishable', async () => {
    const twins = [
      makePage({ id: 'a', chapterId: 'c1', title: 'Page 3', stage: 'scenario' }),
      makePage({ id: 'b', chapterId: 'c2', title: 'Page 3', stage: 'nemu' }),
    ];
    render(
      <LinkCardModal asset={asset} pages={twins} chapterLabels={chapterLabels} onClose={vi.fn()} onLinked={vi.fn()} />,
    );

    const rows = screen.getAllByRole('button', { name: /Page 3/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Prologue');
    expect(rows[1]).toHaveTextContent('Ch. 2');
    // the row is still the link toggle, untouched by the added chip
    expect(rows[0]).toHaveAttribute('aria-pressed', 'false');
  });

  // ── R7-1 · search + chapter filter (the FichiersPanel idiom, client-side) ────
  describe('filters (R7-1)', () => {
    const many = [
      makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' }),
      makePage({ id: 'p2', chapterId: 'c1', title: 'Ruelle de nuit' }),
      makePage({ id: 'p3', chapterId: 'c2', title: 'Page 1' }),
    ];
    const mount = (pagesProp = many) =>
      render(
        <LinkCardModal asset={{ ...asset, type: 'scenario' }} pages={pagesProp} chapterLabels={chapterLabels} onClose={vi.fn()} onLinked={vi.fn()} />,
      );

    it('filters rows by title once the search debounce elapses', async () => {
      mount();
      expect(screen.getAllByRole('button', { name: /Page 1/ })).toHaveLength(2);
      await userEvent.type(screen.getByLabelText('Rechercher une carte'), 'ruelle');
      await waitFor(() => expect(screen.queryByRole('button', { name: /Page 1/ })).toBeNull());
      expect(screen.getByRole('button', { name: /Ruelle de nuit/ })).toBeInTheDocument();
    });

    it('narrows to one chapter with the OnBrandSelect filter — no native select', async () => {
      mount();
      expect(document.querySelector('select')).toBeNull();
      await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Ch. 2' }));

      const rows = screen.getAllByRole('button', { name: /Page 1/ });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent('Ch. 2');
      expect(screen.queryByRole('button', { name: /Ruelle de nuit/ })).toBeNull();
      expect(document.querySelector('select')).toBeNull();
    });

    it('composes the two filters', async () => {
      mount();
      await userEvent.type(screen.getByLabelText('Rechercher une carte'), 'page');
      await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Prologue' }));

      await waitFor(() => expect(screen.getAllByRole('button', { name: /Page 1/ })).toHaveLength(1));
      expect(screen.getByRole('button', { name: /Page 1/ })).toHaveTextContent('Prologue');
    });

    // R7-1d — the modal stays open for multi-linking, so a toggle must not wipe the filters.
    it('keeps both filters after linking a row', async () => {
      vi.mocked(api.linkAssetToPage).mockResolvedValue({
        ...asset,
        type: 'scenario',
        linkedPages: [{ id: 'p3', title: 'Page 1' }],
      });
      mount();
      await userEvent.type(screen.getByLabelText('Rechercher une carte'), 'page');
      await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Ch. 2' }));
      await waitFor(() => expect(screen.getAllByRole('button', { name: /Page 1/ })).toHaveLength(1));

      await userEvent.click(screen.getByRole('button', { name: /Page 1/ }));
      await waitFor(() => expect(api.linkAssetToPage).toHaveBeenCalledWith('a1', { pageId: 'p3' }));

      expect(screen.getByLabelText('Rechercher une carte')).toHaveValue('page');
      expect(screen.getByRole('combobox', { name: 'Filtrer par chapitre' })).toHaveTextContent('Ch. 2');
      const rows = screen.getAllByRole('button', { name: /Page 1/ });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows a no-match state with a reset, distinct from the no-cards state', async () => {
      mount();
      await userEvent.type(screen.getByLabelText('Rechercher une carte'), 'zzz');
      await waitFor(() => expect(screen.getByText('Aucune carte ne correspond.')).toBeInTheDocument());
      expect(screen.queryByText('Aucune carte dans ce projet.')).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
      await waitFor(() => expect(screen.getAllByRole('button', { name: /Page 1/ })).toHaveLength(2));
    });

    it('offers no filter bar when the project has no cards at all', () => {
      mount([]);
      expect(screen.getByText('Aucune carte dans ce projet.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Rechercher une carte')).toBeNull();
      expect(screen.queryByText('Aucune carte ne correspond.')).toBeNull();
    });
  });
});
