import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ToastHost from '../components/ToastHost';
import { beginTransientFailure } from '../lib/toastBus';

const clears: Array<() => void> = [];
const fail = (retry = vi.fn()) => {
  const clear = beginTransientFailure(retry);
  clears.push(clear);
  return clear;
};

afterEach(() => act(() => clears.splice(0).forEach((clear) => clear())));

describe('ToastHost (DR-14 FE-4 · F7/F8/F9/F10)', () => {
  it('renders nothing while no surface is failing', () => {
    const { container } = render(<ToastHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the exact French copy once a surface is failing', () => {
    render(<ToastHost />);
    act(() => {
      fail();
    });
    expect(screen.getByText('Connexion instable — nouvelle tentative…')).toBeInTheDocument();
  });

  it('merges several simultaneous failures into ONE toast, never a stack (F8)', () => {
    render(<ToastHost />);
    act(() => {
      fail();
      fail();
      fail();
    });
    expect(screen.getAllByText('Connexion instable — nouvelle tentative…')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('is announced politely, not as an alert (F10)', () => {
    render(<ToastHost />);
    act(() => {
      fail();
    });
    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers « Réessayer maintenant » which retries every failing surface (F7/D-3)', async () => {
    const user = userEvent.setup();
    const a = vi.fn();
    const b = vi.fn();
    render(<ToastHost />);
    act(() => {
      fail(a);
      fail(b);
    });

    const button = screen.getByRole('button', { name: 'Réessayer maintenant' });
    await user.click(button);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('styles the action with a shared intent class and no inline colour (button-colors rule)', () => {
    render(<ToastHost />);
    act(() => {
      fail();
    });
    const button = screen.getByRole('button', { name: 'Réessayer maintenant' });
    expect(button.className).toContain('ep-btn-compact--ghost');
    expect(button.getAttribute('style') ?? '').not.toMatch(/background|color/);
    // ≥ 44 px tap target at 375 px (F14)
    expect(button.style.minHeight).toBe('44px');
  });

  it('disappears as soon as the pending requests succeed (F9)', () => {
    render(<ToastHost />);
    let clearA!: () => void;
    let clearB!: () => void;
    act(() => {
      clearA = fail();
      clearB = fail();
    });
    act(() => clearA());
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => clearB());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
