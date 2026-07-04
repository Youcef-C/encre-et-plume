import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResumeProgress from '../components/oeuvre/ResumeProgress';

describe('ResumeProgress (DR-11 F-b)', () => {
  it('renders the progressbar with correct aria attributes + indicator text', () => {
    render(<ResumeProgress chapterNumber={4} workTitle="Lames de Brume" page={12} totalPages={28} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '28');
    expect(bar).toHaveAttribute('aria-valuenow', '12');
    expect(bar).toHaveAttribute('aria-label', 'Progression : Ch. 4 · Lames de Brume — page 12 sur 28');
    expect(screen.getByText('Ch. 4 · Lames de Brume — page 12/28')).toBeInTheDocument();
  });

  it('fills the bar to the correct percentage', () => {
    render(<ResumeProgress chapterNumber={4} workTitle="Lames de Brume" page={12} totalPages={28} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('43%');
  });

  it('guards against a division by zero (totalPages=0 -> 0%, no NaN)', () => {
    render(<ResumeProgress chapterNumber={1} workTitle="Onibi" page={0} totalPages={0} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
    expect(bar).toHaveAttribute('aria-valuemax', '0');
  });
});
