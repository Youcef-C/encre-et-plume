import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CallDetail } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getCallDetail: vi.fn(),
  updateCall: vi.fn(),
  deleteCall: vi.fn(),
  closeCall: vi.fn(),
  createCall: vi.fn(),
  getMyProjects: vi.fn(() => Promise.resolve({ items: [] })),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import CallDetailModal from '../components/appels/CallDetailModal';

const base: CallDetail = {
  id: 'call-1',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: '« Lames de Brume »',
  tags: ['Seinen', 'Thriller'],
  authorName: 'Camille R.',
  closesInDays: 12,
  applicationCount: 3,
  direction: 'writerSeeksIllustrator',
  description: 'Un thriller urbain mélancolique, sur plusieurs tomes.',
  sampleUrl: null,
  status: 'open',
  deadline: '2026-07-19T00:00:00.000Z',
  isOwner: false,
  hasApplied: false,
  myApplicationId: null,
  myApplicationStatus: null,
  viewerHasRole: true,
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  samples: [],
  documents: [],
  team: [],
  genres: ['seinen'],
  format: 'serie',
  scope: '~120 planches',
};

const getDetail = () => api.getCallDetail as ReturnType<typeof vi.fn>;
const getDelete = () => api.deleteCall as ReturnType<typeof vi.fn>;
const getClose = () => api.closeCall as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getDetail().mockResolvedValue(base);
});

function open(over: Partial<CallDetail> = {}, props: Partial<Parameters<typeof CallDetailModal>[0]> = {}) {
  if (Object.keys(over).length) getDetail().mockResolvedValue({ ...base, ...over });
  const onClose = vi.fn();
  const onCandidater = vi.fn();
  render(<CallDetailModal callId="call-1" onClose={onClose} onCandidater={onCandidater} {...props} />);
  return { onClose, onCandidater };
}

describe('CallDetailModal', () => {
  it('shows a loading status then the fetched detail', async () => {
    let resolve!: (c: CallDetail) => void;
    getDetail().mockReturnValue(new Promise<CallDetail>((r) => (resolve = r)));
    open();
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    resolve(base);
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
    expect(screen.getByText('Un thriller urbain mélancolique, sur plusieurs tomes.')).toBeInTheDocument();
    expect(screen.getByText('Camille R.')).toBeInTheDocument();
    expect(screen.getByText(/Publié le/)).toBeInTheDocument();
    expect(screen.getByText('3 candidatures')).toBeInTheDocument();
  });

  it('lists per-role seats vs accepted in the Postes section', async () => {
    open({ seats: { dessinateur: 2, scenariste: 1 }, acceptedByRole: { dessinateur: 1 } });
    await screen.findByText('Postes');
    expect(screen.getByText('Dessinateur·rice : 1/2')).toBeInTheDocument();
    expect(screen.getByText('Scénariste : 0/1')).toBeInTheDocument();
  });

  it('renders the sample gallery with alt text and omits it when empty', async () => {
    open({ samples: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] });
    const imgs = await screen.findAllByAltText(/Visuel d'exemple/);
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn/a.jpg');
  });

  it('omits the sample and document sections when empty', async () => {
    open();
    await screen.findByText('« Lames de Brume »');
    expect(screen.queryByText("Visuels d'exemple")).not.toBeInTheDocument();
    expect(screen.queryByText('Documents joints')).not.toBeInTheDocument();
  });

  it('renders the ÉQUIPE section with member rows, role labels and profile links', async () => {
    open({
      team: [
        { userId: 'u1', name: 'Léa Dubois', slug: 'lea-dubois', avatarUrl: null, role: 'scenariste' },
        { userId: 'u2', name: 'Yuki M.', slug: 'yuki-m', avatarUrl: 'https://cdn/av.jpg', role: 'dessinateur' },
      ],
    });
    await screen.findByText('ÉQUIPE');
    expect(screen.getByText('Léa Dubois')).toBeInTheDocument();
    expect(screen.getByText('Scénariste')).toBeInTheDocument();
    const profil = screen.getAllByRole('link', { name: 'Profil' });
    expect(profil[0]).toHaveAttribute('href', '/lea-dubois');
    expect(profil[1]).toHaveAttribute('href', '/yuki-m');
  });

  it('omits the ÉQUIPE section when the team is empty', async () => {
    open();
    await screen.findByText('« Lames de Brume »');
    expect(screen.queryByText('ÉQUIPE')).not.toBeInTheDocument();
  });

  it('renders numbered PDF document links with a size label that download with noopener', async () => {
    open({
      documents: [
        { mediaId: '', url: 'https://cdn/doc1.pdf', size: 2_411_724 },
        { mediaId: '', url: 'https://cdn/doc2.pdf', size: 512_000 },
      ],
    });
    const link1 = await screen.findByRole('link', { name: /Document 1 \(PDF · 2,3 Mo\)/ });
    expect(link1).toHaveAttribute('href', 'https://cdn/doc1.pdf');
    // Security §7: documents download instead of rendering, with a safe rel.
    expect(link1).toHaveAttribute('download');
    expect(link1).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByRole('link', { name: /Document 2 \(PDF · 500,0 Ko\)/ })).toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    getDetail().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(base);
    const user = userEvent.setup();
    render(<CallDetailModal callId="call-1" onClose={vi.fn()} onCandidater={vi.fn()} />);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('« Lames de Brume »')).toBeInTheDocument();
  });

  it('offers Candidater and fires the callback when the viewer holds the sought role', async () => {
    const user = userEvent.setup();
    const { onCandidater } = open();
    await user.click(await screen.findByRole('button', { name: 'Candidater' }));
    expect(onCandidater).toHaveBeenCalledTimes(1);
  });

  it('disables Candidater with a hint when the viewer lacks the sought role', async () => {
    open({ viewerHasRole: false });
    const btn = await screen.findByRole('button', { name: 'Candidater' });
    expect(btn).toBeDisabled();
    const hint = screen.getByText('Cet appel recherche un·e dessinateur·rice.');
    expect(btn).toHaveAttribute('aria-describedby', hint.id);
  });

  it('shows "Candidature envoyée" when the viewer already applied', async () => {
    open({ hasApplied: true, myApplicationId: 'app-3' });
    expect(await screen.findByText('Candidature envoyée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  // MC-14: decided applications surface their real status on the detail pill.
  it('shows "✓ Acceptée" on the detail pill when the viewer application is accepted', async () => {
    open({ hasApplied: true, myApplicationId: 'app-3', myApplicationStatus: 'accepted' });
    expect(await screen.findByText('✓ Acceptée')).toBeInTheDocument();
    expect(screen.queryByText('Candidature envoyée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('shows "✕ Refusée" on the detail pill when the viewer application is rejected', async () => {
    open({ hasApplied: true, myApplicationId: 'app-3', myApplicationStatus: 'rejected' });
    expect(await screen.findByText('✕ Refusée')).toBeInTheDocument();
    expect(screen.queryByText('Candidature envoyée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('keeps "Candidature envoyée" on the detail pill while still pending', async () => {
    open({ hasApplied: true, myApplicationId: 'app-3', myApplicationStatus: 'pending' });
    expect(await screen.findByText('Candidature envoyée')).toBeInTheDocument();
  });

  it('shows only a Clôturé badge on a closed call', async () => {
    open({ status: 'closed' });
    await screen.findByText('« Lames de Brume »');
    expect(screen.getAllByText('Clôturé').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  // MC-14 QA regression: the realistic auto-close trigger IS the accepted applicant's own seat —
  // accepting the last seat closes the call in the SAME commit. `closed ? <Clôturé> : hasApplied ? …`
  // checks `closed` FIRST, so the accepted applicant who just caused the auto-close sees only
  // "Clôturé" instead of their own "✓ Acceptée" status. See qa-report.md defect #1.
  it('[QA] still shows "✓ Acceptée" when the call auto-closed on the viewer own accepted seat', async () => {
    open({ status: 'closed', hasApplied: true, myApplicationId: 'app-3', myApplicationStatus: 'accepted' });
    await screen.findByText('« Lames de Brume »');
    expect(screen.getByText('✓ Acceptée')).toBeInTheDocument();
  });

  it('shows no Candidater action on the owner own call', async () => {
    open({ isOwner: true });
    await screen.findByText('« Lames de Brume »');
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
    expect(screen.queryByText('Candidature envoyée')).not.toBeInTheDocument();
  });

  it('closes on Escape and on overlay click', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await screen.findByText('« Lames de Brume »');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  // ─── Round 3: owner edit / delete controls (F3-3) ────────────────────────────
  describe('owner controls', () => {
    it('shows Éditer + Supprimer for the owner, and neither for a non-owner', async () => {
      open({ isOwner: true });
      await screen.findByText('« Lames de Brume »');
      expect(screen.getByRole('button', { name: 'Éditer' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    });

    it('hides the owner controls for a non-owner', async () => {
      open({ isOwner: false });
      await screen.findByText('« Lames de Brume »');
      expect(screen.queryByRole('button', { name: 'Éditer' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    });

    it('hides Éditer on a closed call but keeps Supprimer', async () => {
      open({ isOwner: true, status: 'closed' });
      await screen.findByText('« Lames de Brume »');
      expect(screen.queryByRole('button', { name: 'Éditer' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    });

    it('opens the pre-filled edit dialog from Éditer', async () => {
      const user = userEvent.setup();
      open({ isOwner: true });
      await user.click(await screen.findByRole('button', { name: 'Éditer' }));
      expect(await screen.findByRole('dialog', { name: "Modifier l'appel" })).toBeInTheDocument();
      expect(screen.getByLabelText('Titre')).toHaveValue('« Lames de Brume »');
    });

    it('confirms inline before deleting — Annuler backs out without calling the API', async () => {
      const user = userEvent.setup();
      open({ isOwner: true });
      await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
      const group = screen.getByRole('group', { name: "Confirmer la suppression de l'appel" });
      expect(within(group).getByText('Supprimer cet appel et ses candidatures ?')).toBeInTheDocument();
      await user.click(within(group).getByRole('button', { name: 'Annuler' }));
      expect(api.deleteCall).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    });

    it('deletes on confirm, then fires onDeleted and onClose', async () => {
      getDelete().mockResolvedValue(undefined);
      const user = userEvent.setup();
      const onDeleted = vi.fn();
      const { onClose } = open({ isOwner: true }, { onDeleted });
      await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
      await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
      await waitFor(() => expect(api.deleteCall).toHaveBeenCalledWith('call-1'));
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });

    // ─── MC-4 amendment: end a call early ("Clôturer l'appel") ─────────────────
    it('shows "Clôturer l\'appel" only for the owner of an open call', async () => {
      open({ isOwner: true, status: 'open' });
      await screen.findByText('« Lames de Brume »');
      expect(screen.getByRole('button', { name: "Clôturer l'appel" })).toBeInTheDocument();
    });

    it('hides "Clôturer l\'appel" for a non-owner', async () => {
      open({ isOwner: false, status: 'open' });
      await screen.findByText('« Lames de Brume »');
      expect(screen.queryByRole('button', { name: "Clôturer l'appel" })).not.toBeInTheDocument();
    });

    it('hides "Clôturer l\'appel" on an already-closed call', async () => {
      open({ isOwner: true, status: 'closed' });
      await screen.findByText('« Lames de Brume »');
      expect(screen.queryByRole('button', { name: "Clôturer l'appel" })).not.toBeInTheDocument();
    });

    it('closes the call on confirm, then reflects the closed state (badge, no Éditer)', async () => {
      getDetail()
        .mockResolvedValueOnce({ ...base, isOwner: true, status: 'open' })
        .mockResolvedValueOnce({ ...base, isOwner: true, status: 'closed' });
      getClose().mockResolvedValue({ ...base, status: 'closed' });
      const user = userEvent.setup();
      const onChanged = vi.fn();
      render(<CallDetailModal callId="call-1" onClose={vi.fn()} onCandidater={vi.fn()} onChanged={onChanged} />);

      await user.click(await screen.findByRole('button', { name: "Clôturer l'appel" }));
      await user.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));

      await waitFor(() => expect(api.closeCall).toHaveBeenCalledWith('call-1'));
      // Closed badge shows in both the meta line and the footer once the refetch lands.
      expect((await screen.findAllByText('Clôturé')).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: 'Éditer' })).not.toBeInTheDocument();
      expect(onChanged).toHaveBeenCalled();
    });

    it('backs out of the close confirm with Annuler without calling the API', async () => {
      const user = userEvent.setup();
      open({ isOwner: true });
      await user.click(await screen.findByRole('button', { name: "Clôturer l'appel" }));
      const group = screen.getByRole('group', { name: "Confirmer la clôture de l'appel" });
      await user.click(within(group).getByRole('button', { name: 'Annuler' }));
      expect(api.closeCall).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: "Clôturer l'appel" })).toBeInTheDocument();
    });

    it('shows the server message when closing fails', async () => {
      getClose().mockRejectedValue({ statusCode: 403, message: "Seul l'auteur peut clôturer cet appel.", error: 'FORBIDDEN' });
      const user = userEvent.setup();
      open({ isOwner: true });
      await user.click(await screen.findByRole('button', { name: "Clôturer l'appel" }));
      await user.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Seul l'auteur peut clôturer/);
    });

    it('shows the server 409 message when deletion is refused', async () => {
      getDelete().mockRejectedValue({
        statusCode: 409,
        message: 'Impossible de supprimer : des candidatures ont déjà été acceptées. Clôturez l’appel plutôt.',
        error: 'CONFLICT',
      });
      const user = userEvent.setup();
      open({ isOwner: true });
      await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
      await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/candidatures ont déjà été acceptées/);
    });
  });

  // ─── Round 3: contrast fixes (F3-4) ──────────────────────────────────────────
  describe('contrast', () => {
    it('renders the "Candidature envoyée" pill in ink (AA fix)', async () => {
      open({ hasApplied: true, myApplicationId: 'app-3' });
      expect(await screen.findByText('Candidature envoyée')).toHaveStyle({ color: 'var(--ink)' });
    });

    it('renders section headings in ink (AA fix)', async () => {
      open();
      expect(await screen.findByText('Description')).toHaveStyle({ color: 'var(--ink)' });
    });
  });
});
