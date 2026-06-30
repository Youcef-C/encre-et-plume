import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfileActions from '../components/ProfileActions';

describe('ProfileActions', () => {
  it('renders "Suivre" button', () => {
    render(<ProfileActions />);
    expect(screen.getByRole('button', { name: /suivre/i })).toBeInTheDocument();
  });

  it('renders "＋ Se connecter" button', () => {
    render(<ProfileActions />);
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('renders "★ Soutenir" button', () => {
    render(<ProfileActions />);
    expect(screen.getByRole('button', { name: /soutenir/i })).toBeInTheDocument();
  });

  it('renders "Proposer une collab" button', () => {
    render(<ProfileActions />);
    expect(screen.getByRole('button', { name: /proposer une collab/i })).toBeInTheDocument();
  });

  it('buttons are keyboard-focusable (not disabled)', () => {
    render(<ProfileActions />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
