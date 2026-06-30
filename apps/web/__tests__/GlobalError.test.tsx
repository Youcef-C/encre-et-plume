import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockCaptureException } = vi.hoisted(() => ({ mockCaptureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureException: mockCaptureException,
  captureRequestError: vi.fn(),
  withSentryConfig: (cfg: unknown) => cfg,
}));

import GlobalError from '../app/global-error';

describe('GlobalError', () => {
  const mockReset = vi.fn();
  const mockError = new Error('Test error');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders French error heading', async () => {
    await act(async () => {
      render(<GlobalError error={mockError} reset={mockReset} />);
    });
    expect(screen.getByRole('heading', { name: /une erreur est survenue/i })).toBeInTheDocument();
  });

  it('renders French retry button', async () => {
    await act(async () => {
      render(<GlobalError error={mockError} reset={mockReset} />);
    });
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('calls reset when retry button is clicked', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<GlobalError error={mockError} reset={mockReset} />);
    });
    await user.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it('calls Sentry.captureException with the error in useEffect', async () => {
    await act(async () => {
      render(<GlobalError error={mockError} reset={mockReset} />);
    });
    expect(mockCaptureException).toHaveBeenCalledWith(mockError);
  });
});
