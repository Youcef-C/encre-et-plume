import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CallDetail } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getCallDetail: vi.fn(),
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
  viewerHasRole: true,
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  samples: [],
  documents: [],
  team: [],
};

const getDetail = () => api.getCallDetail as ReturnType<typeof vi.fn>;

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
    expect(screen.getByRole('link', { name: /Document 2 \(PDF · 0,5 Mo\)/ })).toBeInTheDocument();
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

  it('shows only a Clôturé badge on a closed call', async () => {
    open({ status: 'closed' });
    await screen.findByText('« Lames de Brume »');
    expect(screen.getAllByText('Clôturé').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
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
});
