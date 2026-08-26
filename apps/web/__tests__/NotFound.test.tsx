// F-24 FE-4 — app/not-found.tsx, the page every real 404 now renders.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import NotFound from '../app/not-found';

describe('NotFound (F-24)', () => {
  it('announces the 404 with the verbatim French copy', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page introuvable');
    expect(screen.getByText("Cette page n'existe pas ou a été déplacée.")).toBeInTheDocument();
  });

  it('offers one way back, styled with the shared primary intent class', () => {
    render(<NotFound />);

    const link = screen.getByRole('link', { name: "Retour à l'accueil" });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('ep-btn-primary');
  });

  it('paints no background of its own — the body halftone paper shows through', () => {
    const { container } = render(<NotFound />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.background).toBe('');
  });

  it('sizes the heading fluidly so it works at 375 / 768 / 1280', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 }).style.fontSize).toBe('clamp(32px, 6vw, 56px)');
  });
});
