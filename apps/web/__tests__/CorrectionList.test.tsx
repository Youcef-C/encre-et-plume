import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  createdAt: '2026-07-14T10:00:00.000Z',
  ...over,
});

const baseProps = {
  numberOf: (id: string) => (id === 'c1' ? 1 : 2),
  meId: 'me',
  statusFilter: '' as const,
  onStatusFilter: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
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
    expect(screen.getByText('À corriger')).toBeTruthy();
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
    expect(screen.getByText(/v2/)).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
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

  it('shows the status control for the author', () => {
    render(<CorrectionList {...baseProps} items={[mk({ authorId: 'me' })]} />);
    expect(screen.getByRole('button', { name: /Statut de la correction/i })).toBeTruthy();
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
    expect(screen.queryByRole('button', { name: /Statut de la correction/i })).toBeNull();
  });

  it('shows a delete affordance only for the author', () => {
    const { rerender } = render(<CorrectionList {...baseProps} items={[mk({ authorId: 'me' })]} />);
    expect(screen.getByRole('button', { name: /Supprimer la demande/i })).toBeTruthy();
    rerender(<CorrectionList {...baseProps} items={[mk({ authorId: 'other' })]} />);
    expect(screen.queryByRole('button', { name: /Supprimer la demande/i })).toBeNull();
  });
});
