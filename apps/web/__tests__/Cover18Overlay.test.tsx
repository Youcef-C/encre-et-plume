// DR-10 FE-5 — blur + "18+" badge treatment for listing card covers/thumbnails.
//
// QA round-1 regression (measured): the previous API wrapped the cover element in a
// `height:'100%'` div. Inside a CSS grid with `align-items:stretch` (the catalog/gallery grids),
// that percentage resolves against the *stretched row-track height* (a real definite value, not
// 'auto' as assumed), stretching the wrapper ~53px taller than the cover and pushing every card's
// title into the next row. Fix: Cover18Overlay renders NO wrapping element at all — it is a
// self-contained `position:absolute` overlay (blur backdrop + badge) meant to be placed as a
// sibling INSIDE an already `position:relative`-established cover box, so it can never affect
// that box's own size or push any sibling (title/meta) down. When not triggered, it renders
// nothing (`null`) — zero DOM footprint, zero layout impact.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Cover18Overlay from '../components/age/Cover18Overlay';

describe('Cover18Overlay (DR-10 FE-5)', () => {
  it('renders nothing when is18plus is false (zero DOM footprint, cannot affect layout)', () => {
    const { container } = render(<Cover18Overlay is18plus={false} cleared={false} label="Œuvre 18+" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the viewer is age-cleared, even if is18plus is true', () => {
    const { container } = render(<Cover18Overlay is18plus cleared label="Œuvre 18+" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an "18+" badge (accessible name for screen readers) when is18plus and not cleared', () => {
    render(<Cover18Overlay is18plus cleared={false} label="Œuvre 18+" />);
    expect(screen.getByLabelText('Œuvre 18+')).toBeInTheDocument();
    expect(screen.getByText('18+')).toBeInTheDocument();
  });

  it('never renders an element carrying an explicit height/width style (layout-neutral by construction)', () => {
    const { container } = render(<Cover18Overlay is18plus cleared={false} label="Œuvre 18+" />);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
      expect(el.style.height).toBe('');
      expect(el.style.width).toBe('');
    }
  });

  it('every rendered element is position:absolute (never a normal-flow box that could push siblings)', () => {
    const { container } = render(<Cover18Overlay is18plus cleared={false} label="Œuvre 18+" />);
    const elements = Array.from(container.querySelectorAll<HTMLElement>('*'));
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.style.position).toBe('absolute');
    }
  });
});
