import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ReaderNav from '../components/lecteur/ReaderNav';

describe('ReaderNav (DR-4 FE-5)', () => {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onSetPage = vi.fn();

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a slider with the right bounds and aria-valuetext', () => {
    render(<ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '40');
    expect(slider).toHaveAttribute('aria-valuetext', 'page 12 sur 40');
    expect(screen.getByText('12 / 40')).toBeInTheDocument();
  });

  it('clicking the prev/next buttons calls the callbacks', () => {
    render(<ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables prev at page 1 and enables next mid-way', () => {
    render(<ReaderNav direction="ltr" page={1} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page suivante' })).not.toBeDisabled();
  });

  it('disables next at the last reachable page for the given step', () => {
    render(<ReaderNav direction="ltr" page={39} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
  });

  it('changing the slider calls onSetPage with a number', () => {
    render(<ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } });
    expect(onSetPage).toHaveBeenCalledWith(25);
  });

  it('ArrowRight/ArrowLeft page while mounted', () => {
    render(<ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('ignores arrow keys while focus is in a text input elsewhere on the page', () => {
    render(
      <div>
        <input aria-label="Commenter" />
        <ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />
      </div>,
    );
    screen.getByLabelText('Commenter').focus();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('LTR: the slider carries dir="ltr" (endpoint 1 on the left)', () => {
    render(<ReaderNav direction="ltr" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    expect(screen.getByRole('slider')).toHaveAttribute('dir', 'ltr');
  });

  // ── DR-4 delta: reading direction (RTL) ────────────────────────────────────────

  describe('RTL (Droite→Gauche)', () => {
    it('AC4: ArrowRight = page précédente (onPrev), ArrowLeft = page suivante (onNext)', () => {
      render(<ReaderNav direction="rtl" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onPrev).toHaveBeenCalledTimes(1);
      expect(onNext).not.toHaveBeenCalled();
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('AC3: the slider carries dir="rtl" so it fills right-to-left', () => {
      render(<ReaderNav direction="rtl" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
      expect(screen.getByRole('slider')).toHaveAttribute('dir', 'rtl');
    });

    it('AC10: aria-valuetext stays "page N sur M" regardless of fill direction', () => {
      render(<ReaderNav direction="rtl" page={3} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'page 3 sur 40');
    });

    it('AC1: "Page suivante" is the LEFT circle (disabled at the last page); "Page précédente" is the RIGHT circle (disabled at page 1)', () => {
      const { rerender } = render(
        <ReaderNav direction="rtl" page={1} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />,
      );
      // At page 1: "Page précédente" (right circle) is disabled, "Page suivante" is not.
      expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Page suivante' })).not.toBeDisabled();
      // The buttons are the two circles at the row edges; "suivante" comes first in DOM (left).
      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAccessibleName('Page suivante');
      expect(buttons[buttons.length - 1]).toHaveAccessibleName('Page précédente');

      rerender(<ReaderNav direction="rtl" page={39} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
      // At the last reachable page: "Page suivante" (left circle) is disabled.
      expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
    });

    it('AC1: the left circle triggers onNext and the right circle triggers onPrev', () => {
      render(<ReaderNav direction="rtl" page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
      fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
      expect(onNext).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
      expect(onPrev).toHaveBeenCalledTimes(1);
    });
  });
});
