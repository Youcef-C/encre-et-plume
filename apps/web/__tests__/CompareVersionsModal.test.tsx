// CS-5 (iter 5) Item 1 — the editor "Comparer les versions" side-by-side modal. Sources both panes
// from api.getReview → selected.fromHtml / toHtml (server-sanitized), rendered on the A4 VersionSheet.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewPayload } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({ getReview: vi.fn() }));

import * as api from '../lib/api';
import CompareVersionsModal from '../components/editeur/CompareVersionsModal';

const payload = (from: number, to: number): ReviewPayload => ({
  pageId: 'p1',
  pageTitle: 'Ch. 1',
  stage: 'brouillon',
  project: { slug: 's', title: 'T' },
  members: [],
  files: [],
  selected: {
    assetId: 'a1',
    surface: 'scenario',
    fromVersion: from,
    toVersion: to,
    versions: [],
    fromHtml: `<p>Contenu v${from}</p>`,
    toHtml: `<p>Contenu v${to}</p>`,
    fromImageUrl: null,
    toImageUrl: null,
  },
  corrections: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 },
});

const versions = [
  { version: 3, note: null },
  { version: 2, note: null },
  { version: 1, note: null },
];

const base = {
  pageId: 'p1',
  assetId: 'a1',
  versions,
  headVersion: 3,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (api.getReview as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, opts: { from?: number; to?: number }) =>
    Promise.resolve(payload(opts?.from ?? 2, opts?.to ?? 3)),
  );
});

describe('CompareVersionsModal', () => {
  it('defaults to N-1 ↔ N and renders both sanitized version HTMLs side by side', async () => {
    render(<CompareVersionsModal {...base} onClose={vi.fn()} />);
    // Default compare: from = head-1 = 2, to = head = 3.
    await waitFor(() =>
      expect(api.getReview).toHaveBeenCalledWith('p1', { file: 'a1', from: 2, to: 3 }),
    );
    // C8 — "Contenu v2" vs "Contenu v3" is a changed line: the differing word is wrapped as del/ins.
    await waitFor(() => expect(document.querySelector('del')?.textContent).toBe('v2'));
    expect(document.querySelector('ins')?.textContent).toBe('v3');
    expect(screen.getAllByText(/Contenu/).length).toBeGreaterThan(0);
  });

  it('refetches when a version picker changes', async () => {
    const user = userEvent.setup();
    render(<CompareVersionsModal {...base} onClose={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('del')).toBeTruthy());
    // Left picker (Version A) → pick v1.
    await user.click(screen.getByRole('combobox', { name: /Version à gauche/i }));
    await user.click(screen.getByRole('option', { name: 'v1' }));
    await waitFor(() =>
      expect(api.getReview).toHaveBeenCalledWith('p1', { file: 'a1', from: 1, to: 3 }),
    );
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CompareVersionsModal {...base} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(<CompareVersionsModal {...base} onClose={onClose} />);
    // C7 — the modal is portalled to <body>, so reach the overlay via the dialog's parent.
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  // C8 — the compare shows WHAT changed: word-level <del>/<ins> over the two sanitized version HTMLs.
  it('highlights the diff between the two versions (added/removed runs)', async () => {
    (api.getReview as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, opts: { from?: number; to?: number }) =>
      Promise.resolve({
        ...payload(opts?.from ?? 2, opts?.to ?? 3),
        selected: {
          ...payload(2, 3).selected!,
          fromHtml: '<div class="ep-case-block"><p>le chat noir</p></div>',
          toHtml: '<div class="ep-case-block"><p>le chien noir</p></div>',
        },
      }),
    );
    render(<CompareVersionsModal {...base} onClose={vi.fn()} />);
    // Portalled to <body>, so query the document.
    await waitFor(() => expect(document.querySelector('del')).toBeTruthy());
    expect(document.querySelector('ins')).toBeTruthy();
  });

  it('shows an unavailable note when a version HTML is null', async () => {
    (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...payload(2, 3),
      selected: { ...payload(2, 3).selected!, fromHtml: null },
    });
    render(<CompareVersionsModal {...base} onClose={vi.fn()} />);
    expect(await screen.findByText(/Aperçu indisponible/i)).toBeTruthy();
  });

  // ── CS-20 — the handoff pin drives the default pairing, and adds ONE action ─────────────────
  describe('CS-20 handoff', () => {
    it('seeds `from` with initialFrom (the pinned version) instead of head-1', async () => {
      render(<CompareVersionsModal {...base} initialFrom={1} onClose={vi.fn()} />);
      await waitFor(() => expect(api.getReview).toHaveBeenCalledWith('p1', { file: 'a1', from: 1, to: 3 }));
      expect(screen.getByRole('combobox', { name: /Version à gauche/i })).toHaveTextContent('v1');
    });

    it('renders « J\'ai pris connaissance » only when onAcknowledge is passed, and calls it', async () => {
      const onAcknowledge = vi.fn().mockResolvedValue(undefined);
      const { unmount } = render(<CompareVersionsModal {...base} onClose={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'J’ai pris connaissance' })).toBeNull();
      unmount();

      render(<CompareVersionsModal {...base} initialFrom={2} onAcknowledge={onAcknowledge} onClose={vi.fn()} />);
      const btn = screen.getByRole('button', { name: 'J’ai pris connaissance' });
      expect(btn).toHaveClass('ep-btn-success');
      await userEvent.click(btn);
      await waitFor(() => expect(onAcknowledge).toHaveBeenCalledTimes(1));
    });

    it('keeps the modal open and says so when the acknowledge fails', async () => {
      const onAcknowledge = vi.fn().mockRejectedValue(new Error('boom'));
      render(<CompareVersionsModal {...base} onAcknowledge={onAcknowledge} onClose={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'J’ai pris connaissance' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('L\'enregistrement a échoué. Réessayez.');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('disables the action while the acknowledge is in flight', async () => {
      let release!: () => void;
      const onAcknowledge = vi.fn().mockImplementation(() => new Promise<void>((r) => (release = r)));
      render(<CompareVersionsModal {...base} onAcknowledge={onAcknowledge} onClose={vi.fn()} />);
      const btn = screen.getByRole('button', { name: 'J’ai pris connaissance' });
      await userEvent.click(btn);
      await waitFor(() => expect(btn).toBeDisabled());
      release();
      await waitFor(() => expect(btn).not.toBeDisabled());
    });
  });
});
