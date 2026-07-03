import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import Paywall from '../components/lecteur/Paywall';

describe('Paywall (DR-4 FE-6 / F8)', () => {
  const onClose = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('shows the locked-chapter heading and a support/subscription CTA', () => {
    render(<Paywall chapter={{ number: 4, title: null }} workSlug="lames-de-brume" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /Chapitre verrouillé/ })).toBeInTheDocument();
    expect(screen.getByText(/Chapitre 4/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /soutien/i });
    expect(cta).toHaveAttribute('href', '/oeuvre/lames-de-brume');
  });

  it('the close button fires onClose', () => {
    render(<Paywall chapter={{ number: 4, title: null }} workSlug="lames-de-brume" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape fires onClose', () => {
    render(<Paywall chapter={{ number: 4, title: null }} workSlug="lames-de-brume" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
