import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, ReviewPayload } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// CS-24 — the review screen consumes the notification deep link (?correction=<id>): the row is
// selected and scrolled into view, « Vu » calls POST /corrections/:id/verify, and « Rouvrir » is the
// existing PATCH with status a_corriger.
const router = { push: vi.fn(), replace: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
  useParams: () => ({}),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('../lib/api', () => ({
  getReview: vi.fn(),
  listCorrections: vi.fn(),
  createCorrection: vi.fn(),
  updateCorrection: vi.fn(),
  deleteCorrection: vi.fn(),
  validateReview: vi.fn(),
  verifyCorrection: vi.fn(),
  getProjectWorkspace: vi.fn().mockResolvedValue({ chapters: [], pages: [] }),
}));

import * as api from '../lib/api';
import ReviewClient from '../components/revision/ReviewClient';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const account = { id: 'me', displayName: 'Camille', slug: 'camille' } as unknown as AccountSummary;

const correction = (over: Record<string, unknown> = {}) => ({
  id: 'corr-1',
  pageId: 'page-1',
  assetId: 'a1',
  type: 'dessin' as const,
  anchor: { region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
  caseRef: 'case 1',
  description: 'La main de la case 3 est à l’envers.',
  status: 'corrige' as const,
  authorId: 'me',
  authorName: 'Camille',
  assigneeId: 'yuki',
  filedAgainstVersion: 2,
  resolvedInVersion: 3,
  resolvedById: 'yuki',
  resolvedByName: 'Yuki',
  verifiedAt: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  ...over,
});

const payload = (items = [correction()]): ReviewPayload => ({
  pageId: 'page-1',
  pageTitle: 'Planche 4',
  stage: 'corrections',
  project: { slug: 'lames-de-brume', title: 'Lames de brume' },
  members: [],
  files: [{ assetId: 'a1', filename: 'planche.png', type: 'dessin', surface: 'dessin', currentVersion: 3 }],
  selected: {
    assetId: 'a1',
    surface: 'dessin',
    fromVersion: 2,
    toVersion: 3,
    versions: [
      { version: 3, authorName: 'Yuki', createdAt: '2026-07-15T10:00:00.000Z', note: null, url: 'https://img/v3' },
      { version: 2, authorName: 'Camille', createdAt: '2026-07-14T10:00:00.000Z', note: null, url: 'https://img/v2' },
    ],
    fromHtml: null,
    toHtml: null,
    fromImageUrl: 'https://img/v2',
    toImageUrl: 'https://img/v3',
  },
  corrections: { items: items as never, total: items.length, page: 1, pageSize: 50, totalPages: 1 },
});

function renderClient() {
  return render(
    <SessionContext.Provider value={{ account, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <ReviewClient slug="lames-de-brume" pageId="page-1" />
    </SessionContext.Provider>,
  );
}

describe('ReviewClient — CS-24 verification loop', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    Object.values(mocked).forEach((m) => m.mockReset?.());
    mocked.getReview.mockResolvedValue(payload());
    mocked.getProjectWorkspace.mockResolvedValue({ chapters: [], pages: [] });
  });

  it('selects and scrolls to the correction named by ?correction=', async () => {
    searchParams = new URLSearchParams('correction=corr-1');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = renderClient();
    await waitFor(() => expect(container.querySelector('.ep-correction-card')).toBeTruthy());
    await waitFor(() =>
      expect((container.querySelector('.ep-correction-card') as HTMLElement).dataset.selected).toBe('true'),
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('« Vu » calls the verify endpoint and clears the marker without changing the status', async () => {
    mocked.verifyCorrection.mockResolvedValue(correction({ verifiedAt: '2026-07-16T10:00:00.000Z' }));
    renderClient();
    const vu = await screen.findByRole('button', { name: /Vu/ });
    await userEvent.click(vu);
    await waitFor(() => expect(mocked.verifyCorrection).toHaveBeenCalledWith('corr-1'));
    await waitFor(() => expect(screen.queryByText('en attente de vérification')).toBeNull());
    expect(screen.getByText('Corrigé')).toBeTruthy();
    expect(mocked.updateCorrection).not.toHaveBeenCalled();
  });

  it('« Rouvrir » sends the existing status route with a_corriger (no confirm step)', async () => {
    mocked.updateCorrection.mockResolvedValue(correction({ status: 'a_corriger', resolvedInVersion: null, resolvedById: null, verifiedAt: null }));
    renderClient();
    const reopen = await screen.findByRole('button', { name: /Rouvrir/ });
    await userEvent.click(reopen);
    await waitFor(() => expect(mocked.updateCorrection).toHaveBeenCalledWith('corr-1', { status: 'a_corriger' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByText('À corriger')).toBeTruthy());
  });

  it('surfaces the API refusal on the row when verify fails', async () => {
    mocked.verifyCorrection.mockRejectedValue({ message: "La correction n'est pas marquée corrigée" });
    renderClient();
    await userEvent.click(await screen.findByRole('button', { name: /Vu/ }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', "La correction n'est pas marquée corrigée");
  });
});

// ── CS-25 · New-version triage ────────────────────────────────────────────────
// Entry point + walkthrough over the data the review payload already returns (no new endpoint):
// the head is `files[].currentVersion`, each decision is the existing PATCH /corrections/:id.
describe('ReviewClient — CS-25 new-version triage', () => {
  const open = (over: Record<string, unknown> = {}) =>
    correction({ id: 'corr-1', status: 'a_corriger', resolvedInVersion: null, resolvedById: null, resolvedByName: null, ...over });

  beforeEach(() => {
    searchParams = new URLSearchParams();
    Object.values(mocked).forEach((m) => m.mockReset?.());
    mocked.getProjectWorkspace.mockResolvedValue({ chapters: [], pages: [] });
  });

  it('offers « Passer en revue (n) » only when the head is newer than an open correction, with the right count', async () => {
    mocked.getReview.mockResolvedValue(
      payload([
        open(), // filed against v2, head v3 → triable
        open({ id: 'corr-2', filedAgainstVersion: 3 }), // filed against the head → not triable
        correction({ id: 'corr-3', status: 'corrige' }), // already corrigé → not triable
      ]),
    );
    renderClient();
    const entry = await screen.findByRole('button', { name: 'Passer en revue (1)' });
    expect(entry.className).toContain('ep-btn-primary');
  });

  it('offers no entry point when nothing is triable', async () => {
    mocked.getReview.mockResolvedValue(payload([open({ filedAgainstVersion: 3 })]));
    renderClient();
    await screen.findByRole('button', { name: /Valider les modifications/i });
    expect(screen.queryByRole('button', { name: /Passer en revue/ })).toBeNull();
  });

  it('walks the corrections, writes each decision through the existing status route and exits with a summary', async () => {
    mocked.getReview.mockResolvedValue(payload([open(), open({ id: 'corr-2', description: 'Revoir la trame.' })]));
    mocked.updateCorrection.mockImplementation((id: string, body: { status: string }) =>
      Promise.resolve(correction({ id, status: body.status as never })),
    );
    renderClient();
    await userEvent.click(await screen.findByRole('button', { name: 'Passer en revue (2)' }));
    const region = screen.getByRole('region', { name: 'Passage en revue des corrections' });
    expect(region).toBeTruthy();

    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => expect(mocked.updateCorrection).toHaveBeenCalledWith('corr-1', { status: 'corrige' }));
    fireEvent.keyDown(document, { key: 'e' });
    await waitFor(() => expect(mocked.updateCorrection).toHaveBeenCalledWith('corr-2', { status: 'en_cours' }));

    // last decision → the mode closes with the summary line, focus back on the entry button
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Passage en revue des corrections' })).toBeNull());
    expect(screen.getByText('2 corrections passées en revue')).toBeTruthy();
  });

  it('Escape leaves the mode keeping the decisions already written, and returns focus to the entry button', async () => {
    mocked.getReview.mockResolvedValue(payload([open(), open({ id: 'corr-2' })]));
    mocked.updateCorrection.mockImplementation((id: string, body: { status: string }) =>
      Promise.resolve(correction({ id, status: body.status as never })),
    );
    renderClient();
    await userEvent.click(await screen.findByRole('button', { name: 'Passer en revue (2)' }));
    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => expect(mocked.updateCorrection).toHaveBeenCalledWith('corr-1', { status: 'corrige' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // the decision persisted → the entry count drops to 1 (it is a real write, not local state)
    const entry = await screen.findByRole('button', { name: 'Passer en revue (1)' });
    await waitFor(() => expect(document.activeElement).toBe(entry));

    // re-entering shows the remaining correction, not a reset list
    await userEvent.click(entry);
    expect(await screen.findByText('Correction 1 sur 1')).toBeTruthy();
  });

  it('keeps the mode open and shows the refusal when the decision is denied (403)', async () => {
    mocked.getReview.mockResolvedValue(payload([open()]));
    mocked.updateCorrection.mockRejectedValue({ message: 'Permission « Corrections » requise.' });
    renderClient();
    await userEvent.click(await screen.findByRole('button', { name: 'Passer en revue (1)' }));
    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => expect(mocked.updateCorrection).toHaveBeenCalled());
    const region = await screen.findByRole('region', { name: 'Passage en revue des corrections' });
    expect((await within(region).findByRole('alert')).textContent).toBe('Permission « Corrections » requise.');
  });
});
