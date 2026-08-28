import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CorrectionDto } from '@encre-et-plume/shared';
import Walkthrough, { type WalkthroughProps } from '../components/revision/Walkthrough';

// CS-25 — the walkthrough is a client mode: every decision is the existing PATCH /corrections/:id,
// surfaced here as onDecide → boolean (false = the write was refused, e.g. 403 without « Corrections »).
const corr = (over: Partial<CorrectionDto> = {}): CorrectionDto => ({
  id: 'c1',
  pageId: 'p1',
  assetId: 'a1',
  type: 'dessin',
  anchor: { region: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 } },
  caseRef: 'case 1',
  description: 'Agrandir le plan.',
  status: 'a_corriger',
  authorId: 'yuki',
  authorName: 'Yuki',
  assigneeId: null,
  filedAgainstVersion: 2,
  resolvedInVersion: null,
  resolvedById: null,
  resolvedByName: null,
  verifiedAt: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  ...over,
});

const items = [corr(), corr({ id: 'c2', description: 'Revoir la trame du fond.' })];

function setup(over: Partial<Record<string, unknown>> = {}) {
  const props: Record<string, unknown> = {
    items,
    index: 0,
    numberOf: (id: string) => (id === 'c1' ? 1 : 2),
    onIndex: vi.fn(),
    onDecide: vi.fn().mockResolvedValue(true),
    onExit: vi.fn(),
    busy: false,
    error: null,
    ...over,
  };
  const utils = render(<Walkthrough {...(props as unknown as WalkthroughProps)} />);
  return { ...utils, props };
}

describe('Walkthrough (CS-25)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a labelled region announcing « Correction 1 sur 2 » with a « 1 / 2 » progress', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Passage en revue des corrections' });
    expect(region).toBeTruthy();
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('Correction 1 sur 2');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Agrandir le plan.')).toBeTruthy();
  });

  it('re-announces the progress when the index advances', () => {
    const { rerender, props } = setup();
    rerender(<Walkthrough {...(props as unknown as WalkthroughProps)} index={1} />);
    expect(screen.getByRole('status').textContent).toBe('Correction 2 sur 2');
  });

  it.each([
    ['c', 'corrige'],
    ['r', 'a_corriger'],
    ['e', 'en_cours'],
  ])('« %s » persists via the status handler and advances', async (key, status) => {
    const { props } = setup();
    fireEvent.keyDown(document, { key });
    await waitFor(() => expect(props.onDecide).toHaveBeenCalledWith(items[0], status));
    await waitFor(() => expect(props.onIndex).toHaveBeenCalledWith(1));
  });

  it('has a visible button for each keyboard decision', async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Corrigé/ }));
    expect(props.onDecide).toHaveBeenCalledWith(items[0], 'corrige');
    await userEvent.click(screen.getByRole('button', { name: /^Toujours à revoir/ }));
    expect(props.onDecide).toHaveBeenCalledWith(items[0], 'a_corriger');
    await userEvent.click(screen.getByRole('button', { name: /^En cours/ }));
    expect(props.onDecide).toHaveBeenCalledWith(items[0], 'en_cours');
  });

  it('uses the shared intent classes for the three decisions', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Corrigé/ }).className).toContain('ep-btn-success');
    expect(screen.getByRole('button', { name: /^Toujours à revoir/ }).className).toContain('ep-btn-secondary');
    expect(screen.getByRole('button', { name: /^En cours/ }).className).toContain('ep-btn-dark');
  });

  it('moves with ← / → without changing any status', () => {
    const { props } = setup({ index: 1 });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(props.onIndex).toHaveBeenCalledWith(0);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(props.onDecide).not.toHaveBeenCalled();
  });

  it('exits on Escape and on « Quitter »', async () => {
    const { props } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onExit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /Quitter/ }));
    expect(props.onExit).toHaveBeenCalledTimes(2);
  });

  it('exits when the last correction is decided (no batch submit, the write already happened)', async () => {
    const { props } = setup({ index: 1 });
    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => expect(props.onDecide).toHaveBeenCalledWith(items[1], 'corrige'));
    await waitFor(() => expect(props.onExit).toHaveBeenCalled());
    expect(props.onIndex).not.toHaveBeenCalled();
  });

  it('does not advance when the decision is refused (403 without « Corrections »)', async () => {
    const { props } = setup({ onDecide: vi.fn().mockResolvedValue(false) });
    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => expect(props.onDecide).toHaveBeenCalled());
    expect(props.onIndex).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('surfaces the refusal message as an alert', () => {
    setup({ error: 'Permission « Corrections » requise.' });
    expect(screen.getByRole('alert').textContent).toContain('Permission « Corrections » requise.');
  });

  it('ignores the shortcut keys while typing in a field', () => {
    const { props } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'c' });
    expect(props.onDecide).not.toHaveBeenCalled();
    input.remove();
  });

  it('shows a correction whose region cannot be drawn as a plain row, without blocking', () => {
    setup({
      items: [corr({ id: 'c3', anchor: { region: undefined } as never, description: 'Sans zone.' })],
      index: 0,
    });
    expect(screen.getByText('Sans zone.')).toBeTruthy();
    expect(screen.getByText('Zone non affichable')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Corrigé/ })).toBeTruthy();
  });

  it('gives every action a ≥44px tap target', () => {
    setup();
    for (const name of [/^Corrigé/, /^Toujours à revoir/, /^En cours/, /Quitter/]) {
      const btn = screen.getByRole('button', { name });
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
