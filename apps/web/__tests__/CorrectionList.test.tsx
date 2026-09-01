import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CorrectionDto } from '@encre-et-plume/shared';
import CorrectionList from '../components/revision/CorrectionList';

const mk = (over: Partial<CorrectionDto> = {}): CorrectionDto => ({
  id: 'c1',
  pageId: 'p1',
  assetId: 'a1',
  type: 'dessin',
  anchor: { region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
  caseRef: 'case 1',
  description: "Agrandir le plan, on perd l'échelle.",
  status: 'a_corriger',
  authorId: 'me',
  authorName: 'Camille',
  assigneeId: null,
  filedAgainstVersion: 2,
  resolvedInVersion: null,
  resolvedById: null,
  resolvedByName: null,
  verifiedAt: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  ...over,
});

/** A correction someone else marked corrigé and the filer (me) has not acknowledged yet. */
const resolvedByOther = (over: Partial<CorrectionDto> = {}) =>
  mk({ status: 'corrige', resolvedInVersion: 3, resolvedById: 'yuki', resolvedByName: 'Yuki', ...over });

const baseProps = {
  numberOf: (id: string) => (id === 'c1' ? 1 : 2),
  meId: 'me',
  statusFilter: '' as const,
  onStatusFilter: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onVerify: vi.fn(),
  onDelete: vi.fn(),
  busyId: null,
  rowError: null,
  hasMore: false,
  onLoadMore: vi.fn(),
  loadingMore: false,
};

describe('CorrectionList', () => {
  it('renders rows with number, author and status label', () => {
    render(<CorrectionList {...baseProps} items={[mk()]} />);
    expect(screen.getByText('Camille')).toBeTruthy();
    expect(screen.getAllByText('À corriger').length).toBeGreaterThan(0);
  });

  // iter 6 — the correction cards use the app card idiom (.ep-correction-card: 3px ink border + hard
  // offset shadow + hover, defined in globals.css); the selected row flips to accent chrome.
  it('renders on-brand app cards (ep-correction-card, accent chrome when selected)', () => {
    const { container, rerender } = render(<CorrectionList {...baseProps} items={[mk()]} />);
    const card = container.querySelector('.ep-correction-card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.dataset.selected).toBeUndefined();
    rerender(<CorrectionList {...baseProps} selectedId="c1" items={[mk()]} />);
    expect((container.querySelector('.ep-correction-card') as HTMLElement).dataset.selected).toBe('true');
  });

  // r4 — dessin-only list: no Toutes/Scénario/Dessin type radiogroup, no per-row type chip.
  it('renders no type radiogroup and no type chip (dessin-only)', () => {
    render(<CorrectionList {...baseProps} items={[mk()]} />);
    expect(screen.queryByRole('radiogroup', { name: 'Filtrer par type' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Scénario' })).toBeNull();
    expect(screen.queryByText('Dessin')).toBeNull();
  });

  it('renders the "Corrigé" status pill with the check pictogram (never the "✓" character) and the resolving version chip', () => {
    render(<CorrectionList {...baseProps} items={[mk({ status: 'corrige', resolvedInVersion: 3 })]} />);
    const pill = screen.getByText('Corrigé');
    expect(pill).toBeTruthy();
    expect(pill.querySelector('svg')).toBeTruthy();
    // Assert the version chip itself rather than a loose /v2/ match.
    expect(screen.getByText('v2 → v3')).toBeTruthy();
  });

  it('status filter auto-applies: no "Appliquer" button', () => {
    render(<CorrectionList {...baseProps} items={[mk()]} />);
    expect(screen.queryByRole('button', { name: /Appliquer/i })).toBeNull();
    expect(screen.getByRole('combobox', { name: /Filtrer par statut/i })).toBeTruthy();
  });

  it('shows the empty state when there are no corrections', () => {
    render(<CorrectionList {...baseProps} items={[]} />);
    expect(screen.getByText(/Aucune demande/i)).toBeTruthy();
  });

  // User feedback 2026-09-01 — the cycling « → next » stepper is replaced by an explicit
  // radiogroup: every status visible, the current one checked, one click to any other.
  it('shows the explicit status radiogroup for the author and reports the current status', () => {
    render(<CorrectionList {...baseProps} items={[mk({ authorId: 'me', status: 'en_cours' })]} />);
    const group = screen.getByRole('radiogroup', { name: /Statut de la correction/i });
    expect(group).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'À corriger' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'En cours' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Corrigé' }).getAttribute('aria-checked')).toBe('false');
  });

  it('clicking another status chip calls onStatusChange with that status', () => {
    const onStatusChange = vi.fn();
    const item = mk({ authorId: 'me', status: 'a_corriger' });
    render(<CorrectionList {...baseProps} onStatusChange={onStatusChange} items={[item]} />);
    fireEvent.click(screen.getByRole('radio', { name: 'En cours' }));
    expect(onStatusChange).toHaveBeenCalledWith(item, 'en_cours');
    fireEvent.click(screen.getByRole('radio', { name: 'Corrigé' }));
    expect(onStatusChange).toHaveBeenCalledWith(item, 'corrige');
  });

  it('clicking the current status chip is a no-op', () => {
    const onStatusChange = vi.fn();
    render(<CorrectionList {...baseProps} onStatusChange={onStatusChange} items={[mk({ authorId: 'me', status: 'a_corriger' })]} />);
    fireEvent.click(screen.getByRole('radio', { name: 'À corriger' }));
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  // A4 (iter 6) — the card reflects the correction status colour (left stripe): green for corrigé,
  // accent for à-corriger / en-cours, mirroring the numbered box colour on the image.
  it('reflects status colour on the card (left stripe + data-status)', () => {
    const { container, rerender } = render(<CorrectionList {...baseProps} items={[mk({ status: 'a_corriger' })]} />);
    let card = container.querySelector('.ep-correction-card') as HTMLElement;
    let stripe = container.querySelector('.ep-correction-stripe') as HTMLElement;
    expect(card.dataset.status).toBe('a_corriger');
    expect(stripe.style.background).toContain('var(--accent)');
    rerender(<CorrectionList {...baseProps} items={[mk({ status: 'en_cours' })]} />);
    stripe = container.querySelector('.ep-correction-stripe') as HTMLElement;
    // AMBER (#b45309) — "en cours" is a distinct colour, not red.
    expect(stripe.style.background.toLowerCase()).toMatch(/b45309|rgb\(180, 83, 9\)/);
    rerender(<CorrectionList {...baseProps} items={[mk({ status: 'corrige', resolvedInVersion: 3 })]} />);
    card = container.querySelector('.ep-correction-card') as HTMLElement;
    stripe = container.querySelector('.ep-correction-stripe') as HTMLElement;
    expect(card.dataset.status).toBe('corrige');
    // GREEN (#1f8a5b) — resolved corrections carry the green stripe.
    expect(stripe.style.background.toLowerCase()).toMatch(/1f8a5b|rgb\(31, 138, 91\)/);
  });

  it('hides the status control for a member who is neither author nor assignee', () => {
    render(<CorrectionList {...baseProps} items={[mk({ authorId: 'someone', assigneeId: null })]} />);
    expect(screen.queryByRole('radiogroup', { name: /Statut de la correction/i })).toBeNull();
  });

  it('shows a delete affordance only for the author', () => {
    const { rerender } = render(<CorrectionList {...baseProps} items={[mk({ authorId: 'me' })]} />);
    expect(screen.getByRole('button', { name: /Supprimer la demande/i })).toBeTruthy();
    rerender(<CorrectionList {...baseProps} items={[mk({ authorId: 'other' })]} />);
    expect(screen.queryByRole('button', { name: /Supprimer la demande/i })).toBeNull();
  });

  // ── CS-24 — the verification loop ────────────────────────────────────────────
  describe('CS-24 verification', () => {
    it('marks the filer\'s row « en attente de vérification » when someone else resolved it', () => {
      render(<CorrectionList {...baseProps} items={[resolvedByOther()]} />);
      const marker = screen.getByText('en attente de vérification');
      expect(marker).toBeTruthy();
      // Never colour-only: the marker carries a pictogram + the words.
      expect(marker.closest('span')?.querySelector('svg')).toBeTruthy();
    });

    it('offers « Vu » and « Rouvrir » to the filer, and calls the handlers', () => {
      const onVerify = vi.fn();
      const onStatusChange = vi.fn();
      const item = resolvedByOther();
      render(<CorrectionList {...baseProps} onVerify={onVerify} onStatusChange={onStatusChange} items={[item]} />);
      fireEvent.click(screen.getByRole('button', { name: /Vu/ }));
      expect(onVerify).toHaveBeenCalledWith(item);
      fireEvent.click(screen.getByRole('button', { name: /Rouvrir/ }));
      expect(onStatusChange).toHaveBeenCalledWith(item, 'a_corriger');
    });

    it('drops the marker and « Vu » once the filer acknowledged, keeping the status and « Rouvrir »', () => {
      render(<CorrectionList {...baseProps} items={[resolvedByOther({ verifiedAt: '2026-07-16T10:00:00.000Z' })]} />);
      expect(screen.queryByText('en attente de vérification')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Vu/ })).toBeNull();
      expect(screen.getByText('Corrigé')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Rouvrir/ })).toBeTruthy();
    });

    it('shows nothing extra when the filer resolved their own correction', () => {
      render(<CorrectionList {...baseProps} items={[mk({ status: 'corrige', resolvedInVersion: 3, resolvedById: 'me', resolvedByName: 'Camille' })]} />);
      expect(screen.queryByText('en attente de vérification')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Vu/ })).toBeNull();
    });

    it('shows no marker to a member who is not the filer', () => {
      render(<CorrectionList {...baseProps} items={[resolvedByOther({ authorId: 'someone', assigneeId: 'me' })]} />);
      expect(screen.queryByText('en attente de vérification')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Vu/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Rouvrir/ })).toBeNull();
    });

    // User feedback 2026-09-01 — the Avant/Après crop comparison is gone; a resolved dessin row
    // shows only the version transition label.
    it('shows vN → vM on a resolved dessin row and no crop pair', () => {
      const { container } = render(<CorrectionList {...baseProps} items={[resolvedByOther()]} />);
      expect(screen.getByText('v2 → v3')).toBeTruthy();
      expect(container.querySelector('.ep-crop-pair')).toBeNull();
      expect(container.querySelector('.ep-crop')).toBeNull();
      expect(screen.queryByText(/Avant/)).toBeNull();
      expect(screen.queryByText(/Après/)).toBeNull();
    });

    it('shows the reported quote for a scenario correction', () => {
      const scenario = resolvedByOther({
        type: 'scenario',
        anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'abandonné, noyé d\'ombre' },
      });
      const { container } = render(<CorrectionList {...baseProps} items={[scenario]} />);
      expect(screen.getByText('Texte signalé')).toBeTruthy();
      expect(screen.getByText(/abandonné, noyé d’ombre|abandonné, noyé d'ombre/)).toBeTruthy();
      expect(container.querySelector('.ep-crop')).toBeNull();
    });

    it('exposes each row for the deep-link scroll (data-correction-id)', () => {
      const { container } = render(<CorrectionList {...baseProps} items={[mk()]} />);
      expect(container.querySelector('[data-correction-id="c1"]')).toBeTruthy();
    });
  });
});
