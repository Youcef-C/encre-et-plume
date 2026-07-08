import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaResponse } from '@encre-et-plume/shared';
import { MAX_UPLOAD_BYTES } from '@encre-et-plume/shared';

// Mock api functions used by UploadControl
vi.mock('../lib/api', () => ({
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
  buildSrcSet: vi.fn().mockReturnValue('https://cdn/thumb.webp 320w, https://cdn/web.webp 1280w'),
  // stubs for other imports that may be pulled in transitively
  getProfile: vi.fn(),
  setAvatar: vi.fn(),
}));

// ─── AvatarCropModal mock ────────────────────────────────────────────────────
// Avoids canvas/WebGL dependency; exposes onConfirm/onCancel for direct control.
let capturedCropProps:
  | { onConfirm: (b: Blob, t: string) => void; onCancel: () => void }
  | undefined;

vi.mock('../components/AvatarCropModal', () => ({
  default: ({
    onConfirm,
    onCancel,
  }: {
    onConfirm: (b: Blob, t: string) => void;
    onCancel: () => void;
  }) => {
    capturedCropProps = { onConfirm, onCancel };
    return (
      <div data-testid="avatar-crop-modal">
        <button type="button" onClick={onCancel}>
          Annuler recadrage
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm(new Blob(['img'], { type: 'image/jpeg' }), 'image/jpeg')
          }
        >
          Rogner
        </button>
      </div>
    );
  },
}));

// ─── XHR mock ────────────────────────────────────────────────────────────────
// Captures the last XHR instance so tests can trigger onload/onerror/progress/abort.
let capturedXHR:
  | {
      open: ReturnType<typeof vi.fn>;
      setRequestHeader: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      abort: ReturnType<typeof vi.fn>;
      upload: { onprogress: ((e: Partial<ProgressEvent>) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      status: number;
    }
  | undefined;

const XHRMock = vi.fn().mockImplementation(function () {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    upload: { onprogress: null as ((e: Partial<ProgressEvent>) => void) | null },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    status: 200,
  };
  capturedXHR = xhr;
  return xhr;
});

beforeEach(() => {
  capturedCropProps = undefined;
  vi.stubGlobal('XMLHttpRequest', XHRMock);
  capturedXHR = undefined;
  XHRMock.mockClear();
  vi.mocked(requestUpload).mockReset();
  vi.mocked(finalizeMedia).mockReset();
  vi.mocked(getMedia).mockReset();
  // jsdom's URL.createObjectURL throws; stub it for crop flow tests
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUploadResponse = {
  mediaId: 'media-1',
  uploadUrl: 'https://minio.test/bucket/avatar/acc1/media-1.jpg',
  bucketKey: 'avatar/acc1/media-1.jpg',
  expiresIn: 300,
};

const mockMedia: MediaResponse = {
  id: 'media-1',
  kind: 'avatar',
  status: 'ready',
  visibility: 'public',
  width: 200,
  height: 200,
  variants: {
    orig: 'https://cdn/orig.jpg',
    web: 'https://cdn/web.webp',
    thumb: 'https://cdn/thumb.webp',
  },
  createdAt: '2026-06-30T00:00:00Z',
};

function validFile() {
  return new File(['image-content'], 'photo.jpg', { type: 'image/jpeg' });
}

function makeFileWithSize(type: string, size: number): File {
  const f = new File(['x'], 'test.img', { type });
  // Shadow the prototype getter to control size in tests
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

/** Helper: select a file and confirm the crop modal for avatar uploads. */
async function selectAndConfirmCrop(file: File) {
  fireEvent.change(getFileInput(), { target: { files: [file] } });
  await waitFor(() => expect(capturedCropProps).toBeDefined());
  capturedCropProps!.onConfirm(new Blob(['img'], { type: 'image/jpeg' }), 'image/jpeg');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { requestUpload, finalizeMedia, getMedia } from '../lib/api';
import UploadControl from '../components/UploadControl';

describe('UploadControl — idle state', () => {
  it('renders French idle copy', () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    expect(screen.getByText('Glissez une image ou cliquez pour choisir')).toBeInTheDocument();
  });

  it('has a button with an accessible name from the label prop', () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    expect(screen.getByRole('button', { name: /photo de profil/i })).toBeInTheDocument();
  });

  it('has an aria-live region for progress announcements', () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });
});

describe('UploadControl — document kind', () => {
  it('renders document idle copy and accepts PDF + text', () => {
    render(<UploadControl kind="call_document" label="Ajouter un document (PDF)" onUploaded={vi.fn()} />);
    expect(screen.getByText('Glissez un PDF ou cliquez pour choisir')).toBeInTheDocument();
    expect(getFileInput()).toHaveAttribute('accept', 'application/pdf,text/plain');
  });

  it('rejects an image file with a French error and no upload', async () => {
    const onUploaded = vi.fn();
    render(<UploadControl kind="call_document" label="Ajouter un document (PDF)" onUploaded={onUploaded} />);
    fireEvent.change(getFileInput(), {
      target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByText('Format non pris en charge (PDF, TXT)')).toBeInTheDocument());
    expect(requestUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('uploads a PDF and, once ready, shows the filename and passes it to onUploaded', async () => {
    const onUploaded = vi.fn();
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    render(<UploadControl kind="call_document" label="Ajouter un document (PDF)" onUploaded={onUploaded} />);
    fireEvent.change(getFileInput(), {
      target: { files: [new File(['%PDF-1.4'], 'scenario.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    expect(await screen.findByText('✓ scenario.pdf')).toBeInTheDocument();
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }), 'scenario.pdf'),
    );
  });
});

describe('UploadControl — combined box (documentKind)', () => {
  it('accepts every family and routes an image to the image kind', async () => {
    const onUploaded = vi.fn();
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, kind: 'call_sample', status: 'ready' });

    render(
      <UploadControl kind="call_sample" documentKind="call_document" label="Ajouter un fichier" onUploaded={onUploaded} />,
    );
    expect(getFileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/avif,application/pdf,text/plain');
    expect(screen.getByText('Glissez une image, un PDF ou un fichier texte, ou cliquez pour choisir')).toBeInTheDocument();

    fireEvent.change(getFileInput(), {
      target: { files: [new File(['img'], 'art.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(requestUpload).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call_sample' })));
  });

  it('routes a PDF to the document kind', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, kind: 'call_document', status: 'ready' });

    render(
      <UploadControl kind="call_sample" documentKind="call_document" label="Ajouter un fichier" onUploaded={vi.fn()} />,
    );
    fireEvent.change(getFileInput(), {
      target: { files: [new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(requestUpload).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call_document' })));
  });

  it('rejects a picked file when extraValidate returns a message', async () => {
    const onUploaded = vi.fn();
    render(
      <UploadControl
        kind="call_sample"
        documentKind="call_document"
        label="Ajouter un fichier"
        onUploaded={onUploaded}
        extraValidate={() => 'Maximum 5 visuels.'}
      />,
    );
    fireEvent.change(getFileInput(), {
      target: { files: [new File(['img'], 'art.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByText('Maximum 5 visuels.')).toBeInTheDocument());
    expect(requestUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

describe('UploadControl — client-side validation', () => {
  it('rejects oversize file and shows French error without calling requestUpload', async () => {
    const onUploaded = vi.fn();
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={onUploaded} />);

    const bigFile = makeFileWithSize('image/jpeg', MAX_UPLOAD_BYTES + 1);
    fireEvent.change(getFileInput(), { target: { files: [bigFile] } });

    await waitFor(() =>
      expect(screen.getByText(/Fichier trop volumineux/)).toBeInTheDocument()
    );
    expect(requestUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('rejects unsupported content-type and shows French error without calling requestUpload', async () => {
    const onUploaded = vi.fn();
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={onUploaded} />);

    const gifFile = new File(['GIF89a'], 'anim.gif', { type: 'image/gif' });
    fireEvent.change(getFileInput(), { target: { files: [gifFile] } });

    await waitFor(() =>
      expect(screen.getByText(/Format non pris en charge/)).toBeInTheDocument()
    );
    expect(requestUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('shows retry button after a client-side validation error', async () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    const gifFile = new File(['GIF'], 'anim.gif', { type: 'image/gif' });
    fireEvent.change(getFileInput(), { target: { files: [gifFile] } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument());
  });
});

describe('UploadControl — crop step (avatar)', () => {
  it('shows AvatarCropModal after selecting a valid image (kind=avatar)', async () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    fireEvent.change(getFileInput(), { target: { files: [validFile()] } });

    await waitFor(() =>
      expect(screen.getByTestId('avatar-crop-modal')).toBeInTheDocument()
    );
    expect(requestUpload).not.toHaveBeenCalled();
  });

  it('cancelling crop returns to idle (no upload)', async () => {
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    fireEvent.change(getFileInput(), { target: { files: [validFile()] } });

    await waitFor(() => expect(capturedCropProps).toBeDefined());
    capturedCropProps!.onCancel();

    await waitFor(() =>
      expect(screen.getByText('Glissez une image ou cliquez pour choisir')).toBeInTheDocument()
    );
    expect(requestUpload).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('confirming crop drives upload flow via startUpload', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    const onUploaded = vi.fn();
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={onUploaded} />);

    await selectAndConfirmCrop(validFile());

    // requestUpload is called with the cropped blob's content-type
    await waitFor(() =>
      expect(requestUpload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'avatar', contentType: 'image/jpeg' }),
      )
    );
    capturedXHR!.onload?.();

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('does NOT show crop modal for non-avatar kinds — uploads directly', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    render(<UploadControl kind="portfolio" label="Image portfolio" onUploaded={vi.fn()} />);
    fireEvent.change(getFileInput(), { target: { files: [validFile()] } });

    // Crop modal should NOT appear; requestUpload is called directly
    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    expect(screen.queryByTestId('avatar-crop-modal')).not.toBeInTheDocument();
  });
});

describe('UploadControl — upload flow', () => {
  it('shows upload progress percentage', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    // Wait for requestUpload to be called (XHR is set up synchronously after)
    await waitFor(() => expect(requestUpload).toHaveBeenCalled());

    // Simulate 50% progress
    capturedXHR!.upload.onprogress?.({
      loaded: 50,
      total: 100,
      lengthComputable: true,
    } as ProgressEvent);

    // Check via progressbar aria attribute (avoids duplicate text from aria-live region)
    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '50');
    });
  });

  it('shows Optimisation… during processing (while polling)', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });

    // Block getMedia to hold the "processing" state visible
    let resolveGetMedia!: (m: MediaResponse) => void;
    vi.mocked(getMedia).mockReturnValueOnce(
      new Promise((res) => { resolveGetMedia = res; })
    );

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    // Text appears in both button and aria-live region; check at least one match
    await waitFor(() =>
      expect(screen.getAllByText('Optimisation…').length).toBeGreaterThan(0)
    );

    // Resolve the pending poll
    resolveGetMedia({ ...mockMedia, status: 'ready' });
  });

  it('calls onUploaded with media after successful full flow', async () => {
    const onUploaded = vi.fn();
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={onUploaded} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    await waitFor(() =>
      expect(onUploaded.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'media-1', status: 'ready' })),
    );
  });

  it('sends only Content-Type header in the PUT request (no session cookie)', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());

    expect(capturedXHR!.open).toHaveBeenCalledWith('PUT', mockUploadResponse.uploadUrl);
    expect(capturedXHR!.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    // Should not set Authorization or Cookie headers
    expect(capturedXHR!.setRequestHeader).toHaveBeenCalledTimes(1);
  });
});

describe('UploadControl — error states', () => {
  it('shows error and Réessayer button on XHR network error', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onerror?.();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/Échec du téléversement/)).toBeInTheDocument();
  });

  it('shows error and Réessayer button when media status is failed', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'failed' });

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument()
    );
  });

  it('shows error when requestUpload itself fails (400 from API)', async () => {
    vi.mocked(requestUpload).mockRejectedValue({
      statusCode: 400,
      message: 'Type de fichier non autorisé',
      error: 'BAD_REQUEST',
    });

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument()
    );
  });
});

describe('UploadControl — abort / cancel', () => {
  it('shows Annuler button during uploading phase', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    // XHR is in-progress (not resolved yet)
    await waitFor(() => expect(capturedXHR).toBeDefined());
    // Progress is set to 0 (uploading phase started)
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /Annuler/i })).toBeInTheDocument();
  });

  it('shows Annuler button during processing phase', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });

    // Block getMedia so processing phase is visible
    vi.mocked(getMedia).mockReturnValue(new Promise(() => {}));

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    await waitFor(() =>
      expect(screen.getAllByText('Optimisation…').length).toBeGreaterThan(0)
    );
    expect(screen.getByRole('button', { name: /Annuler/i })).toBeInTheDocument();
  });

  it('clicking Annuler during upload aborts XHR and returns to idle', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);

    const user = userEvent.setup();
    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Annuler/i }));

    expect(capturedXHR!.abort).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText('Glissez une image ou cliquez pour choisir')).toBeInTheDocument()
    );
  });

  it('clicking Annuler during processing clears poll timer and returns to idle', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockReturnValue(new Promise(() => {})); // never resolves

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const user = userEvent.setup();

    render(<UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />);
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    await waitFor(() =>
      expect(screen.getAllByText('Optimisation…').length).toBeGreaterThan(0)
    );

    await user.click(screen.getByRole('button', { name: /Annuler/i }));

    expect(clearTimeoutSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText('Glissez une image ou cliquez pour choisir')).toBeInTheDocument()
    );

    clearTimeoutSpy.mockRestore();
  });

  it('unmounting during upload aborts XHR', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);

    const { unmount } = render(
      <UploadControl kind="avatar" label="Photo de profil" onUploaded={vi.fn()} />
    );
    await selectAndConfirmCrop(validFile());

    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    await waitFor(() => expect(capturedXHR).toBeDefined());

    unmount();

    expect(capturedXHR!.abort).toHaveBeenCalled();
  });
});

describe('UploadControl — onBusyChange', () => {
  it('calls onBusyChange(true) when entering busy phases and onBusyChange(false) when done', async () => {
    vi.mocked(requestUpload).mockResolvedValue(mockUploadResponse);
    vi.mocked(finalizeMedia).mockResolvedValue({ ...mockMedia, status: 'pending' });
    vi.mocked(getMedia).mockResolvedValue({ ...mockMedia, status: 'ready' });

    const onBusyChange = vi.fn();
    render(
      <UploadControl
        kind="avatar"
        label="Photo de profil"
        onUploaded={vi.fn()}
        onBusyChange={onBusyChange}
      />
    );

    // Select file → enters cropping phase (busy)
    fireEvent.change(getFileInput(), { target: { files: [validFile()] } });
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));

    // Confirm crop → starts upload
    capturedCropProps!.onConfirm(new Blob(['img'], { type: 'image/jpeg' }), 'image/jpeg');
    await waitFor(() => expect(requestUpload).toHaveBeenCalled());
    capturedXHR!.onload?.();

    // After full flow, should call with false
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));
  });
});
