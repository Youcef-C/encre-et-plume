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
    render(<ReaderNav page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '40');
    expect(slider).toHaveAttribute('aria-valuetext', 'page 12 sur 40');
    expect(screen.getByText('12 / 40')).toBeInTheDocument();
  });

  it('clicking the prev/next buttons calls the callbacks', () => {
    render(<ReaderNav page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables prev at page 1 and enables next mid-way', () => {
    render(<ReaderNav page={1} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page suivante' })).not.toBeDisabled();
  });

  it('disables next at the last reachable page for the given step', () => {
    render(<ReaderNav page={39} totalPages={40} step={2} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
  });

  it('changing the slider calls onSetPage with a number', () => {
    render(<ReaderNav page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } });
    expect(onSetPage).toHaveBeenCalledWith(25);
  });

  it('ArrowRight/ArrowLeft page while mounted', () => {
    render(<ReaderNav page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('ignores arrow keys while focus is in a text input elsewhere on the page', () => {
    render(
      <div>
        <input aria-label="Commenter" />
        <ReaderNav page={12} totalPages={40} step={1} onPrev={onPrev} onNext={onNext} onSetPage={onSetPage} />
      </div>,
    );
    screen.getByLabelText('Commenter').focus();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
  });
});
