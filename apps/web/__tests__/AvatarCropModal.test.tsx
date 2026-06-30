import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Area } from 'react-easy-crop';

// ─── Mock react-easy-crop ─────────────────────────────────────────────────────
// jsdom has no real canvas/WebGL rendering. The mock immediately fires onCropComplete
// with a fixed crop area so tests can proceed to the confirm step.

let capturedOnCropComplete: ((area: Area, pixels: Area) => void) | null = null;

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete }: { onCropComplete: (area: Area, pixels: Area) => void }) => {
    capturedOnCropComplete = onCropComplete;
    return <div data-testid="mock-cropper" />;
  },
}));

// ─── Mock canvas ─────────────────────────────────────────────────────────────
// jsdom canvas methods are no-ops; we override toBlob to return a fake JPEG blob.

beforeEach(() => {
  capturedOnCropComplete = null;

  // Mock Image loading
  vi.stubGlobal(
    'Image',
    class MockImage {
      _src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        // Trigger onload on next tick
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function (
    cb: (blob: Blob | null) => void,
  ) {
    cb(new Blob(['fake-image-data'], { type: 'image/jpeg' }));
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import AvatarCropModal from '../components/AvatarCropModal';

const fakeArea: Area = { x: 0, y: 0, width: 100, height: 100 };

describe('AvatarCropModal — basic render', () => {
  it('renders with dialog role and French label', () => {
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: /recadrer/i })).toBeInTheDocument();
  });

  it('renders Rogner and Annuler buttons', () => {
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Rogner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Annuler/i })).toBeInTheDocument();
  });

  it('renders zoom slider', () => {
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
  });

  it('Rogner button is disabled before crop area is set', () => {
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Rogner/i })).toBeDisabled();
  });
});

describe('AvatarCropModal — interactions', () => {
  it('Annuler calls onCancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Rogner calls onConfirm with a Blob after crop area is set', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <AvatarCropModal
        imageSrc="blob:test"
        contentType="image/jpeg"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    // Simulate the cropper reporting a crop area
    fireEvent.click(screen.getByTestId('mock-cropper'));
    capturedOnCropComplete?.(fakeArea, fakeArea);

    // Now Rogner should be enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Rogner/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /Rogner/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(
        expect.any(Blob),
        'image/jpeg',
      );
    });
  });
});
