import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VerificationGatePrompt from '../components/VerificationGatePrompt';

describe('VerificationGatePrompt', () => {
  it('renders "Confirmez votre e-mail pour continuer."', () => {
    render(<VerificationGatePrompt />);
    expect(screen.getByText(/Confirmez votre e-mail pour continuer/)).toBeInTheDocument();
  });
});
