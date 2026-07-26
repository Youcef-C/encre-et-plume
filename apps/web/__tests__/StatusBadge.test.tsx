import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../components/candidatures/StatusBadge';

// U-4 rule: check/cross marks are pictograms (icons.tsx), never the "✓"/"✕" characters.
// The badge must still read as text (never icon/colour alone).
describe('StatusBadge', () => {
  it('renders "Acceptée" with the check pictogram and no glyph character', () => {
    const { container } = render(<StatusBadge status="accepted" />);
    expect(screen.getByText('Acceptée')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/[✓✔✅✕✖❌✗]/);
  });

  it('renders "Refusée" with the cross pictogram and no glyph character', () => {
    const { container } = render(<StatusBadge status="rejected" />);
    expect(screen.getByText('Refusée')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/[✓✔✅✕✖❌✗]/);
  });

  it('keeps the pending badge readable as text (the dot stays typography)', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('● En attente')).toBeInTheDocument();
  });
});
