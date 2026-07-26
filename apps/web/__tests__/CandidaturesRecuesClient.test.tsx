import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AccountSummary,
  ApplicationDto,
  CallDetail,
  ReceivedApplicationsResponse,
  ReceivedCallGroup,
} from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getReceivedApplications: vi.fn(),
    decideApplication: vi.fn(),
    removeApplicant: vi.fn(),
    getCallDetail: vi.fn(),
    deleteCall: vi.fn(),
    updateCall: vi.fn(),
    closeCall: vi.fn(),
    getMyProjects: vi.fn(() => Promise.resolve({ items: [] })),
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import CandidaturesRecuesClient from '../components/candidatures/CandidaturesRecuesClient';

const account: AccountSummary = {
  id: 'owner-1',
  displayName: 'Testeur Appels',
  email: 'owner@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'testeur-appels',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const application = (over: Partial<ApplicationDto> = {}): ApplicationDto => ({
  id: 'app-1',
  callId: 'call-1',
  applicant: { userId: 'u-lea', name: 'Léa B.', slug: 'lea-b', avatarUrl: null, role: 'scenariste' },
  sampleUrl: 'https://cdn/lea-sample.jpg',
  samples: [{ url: 'https://cdn/lea-sample.jpg', kind: 'image', size: null }],
  message: 'Vos ambiances nocturnes collent à mon écriture.',
  status: 'pending',
  appliedAs: 'scenariste',
  createdAt: '2026-06-18T10:00:00.000Z',
  ...over,
});

const group = (over: Partial<ReceivedCallGroup> = {}): ReceivedCallGroup => ({
  callId: 'mc7-call-nocturne',
  callTitle: 'Polar nocturne',
  applications: [application()],
  ...over,
});

const threeApps: ApplicationDto[] = [
  application({ id: 'a1' }),
  application({
    id: 'a2',
    applicant: { userId: 'u-noe', name: 'Noé P.', slug: 'noe-p', avatarUrl: null, role: 'scenariste' },
    message: '',
  }),
  application({
    id: 'a3',
    applicant: { userId: 'u-diego', name: 'Diego S.', slug: 'diego-s', avatarUrl: null, role: 'scenariste' },
    status: 'rejected',
  }),
];

// Relative, not a fixed date: the edit modal rejects a past deadline, so a hardcoded
// one silently rots the "Enregistrer" test the day it expires. 10d out matches closesInDays.
const deadlineISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00`).toISOString();
})();

const callDetail: CallDetail = {
  id: 'mc7-call-nocturne',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: 'Polar nocturne',
  tags: ['Seinen'],
  authorName: 'Testeur Appels',
  authorAvatar: null,
  closesInDays: 10,
  applicationCount: 3,
  direction: 'writerSeeksIllustrator',
  description: 'Un polar nocturne sous la pluie.',
  sampleUrl: null,
  status: 'open',
  deadline: deadlineISO,
  isOwner: true,
  hasApplied: false,
  myApplicationId: null,
  myApplicationStatus: null,
  viewerHasRole: false,
  seekingRoles: ['scenariste'],
  seats: { scenariste: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  samples: [],
  documents: [],
  team: [],
  genres: ['action'],
  format: null,
  scope: null,
};

const response = (groups: ReceivedCallGroup[]): ReceivedApplicationsResponse => ({ groups });

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <CandidaturesRecuesClient />
    </SessionContext.Provider>,
  );
}

const getList = () => api.getReceivedApplications as ReturnType<typeof vi.fn>;
const getDecide = () => api.decideApplication as ReturnType<typeof vi.fn>;
const getRemove = () => api.removeApplicant as ReturnType<typeof vi.fn>;
const getDetail = () => api.getCallDetail as ReturnType<typeof vi.fn>;
const getDelete = () => api.deleteCall as ReturnType<typeof vi.fn>;
const getUpdate = () => api.updateCall as ReturnType<typeof vi.fn>;
const getClose = () => api.closeCall as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('CandidaturesRecuesClient (MC-7)', () => {
  it('shows skeletons while loading, then the selected call with the count badge and full rows', async () => {
    let resolve!: (r: ReceivedApplicationsResponse) => void;
    getList().mockReturnValue(new Promise<ReceivedApplicationsResponse>((r) => (resolve = r)));
    renderClient();
    expect(screen.getByRole('status', { name: /chargement/i })).toBeInTheDocument();
    resolve(response([group({ applications: threeApps })]));

    // Selector trigger shows the guillemet-wrapped call title; accent count badge reflects the group size.
    expect(await screen.findByText('« Polar nocturne »')).toBeInTheDocument();
    expect(screen.getByText('3 candidatures')).toBeInTheDocument();

    // "Voir l'appel" is a button (opens the modal), not a navigation link — right-aligned on the selector row.
    const seeCall = screen.getByRole('button', { name: "Voir l'appel « Polar nocturne »" });
    expect(seeCall).toBeInTheDocument();
    expect(seeCall).toHaveStyle({ marginLeft: 'auto' });

    // Applicant name is plain bold — NOT a link. The profile link is the separate "Voir le profil" button.
    expect(screen.getByText('Léa B.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Léa B.' })).not.toBeInTheDocument();
    const profileLinks = screen.getAllByRole('link', { name: /Voir le profil/ });
    expect(profileLinks[0]).toHaveAttribute('href', '/lea-b');

    // Role chip + message + labelled image sample (viewable, new tab).
    expect(screen.getAllByText(/Scénariste/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Vos ambiances nocturnes/)[0]).toBeInTheDocument();
    const sample = screen.getAllByRole('link', { name: /Voir l'échantillon de Léa B\./ })[0];
    expect(sample).toHaveAttribute('href', 'https://cdn/lea-sample.jpg');
    expect(sample).toHaveAttribute('target', '_blank');

    // Pending rows expose both actions.
    expect(screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser la candidature de Léa B.' })).toBeInTheDocument();
  });

  it('groups the work sample (left) and the action buttons (right) in one bottom row', async () => {
    getList().mockResolvedValue(response([group()]));
    renderClient();
    await screen.findByText('« Polar nocturne »');

    const sample = screen.getByRole('link', { name: /Voir l'échantillon de Léa B\./ });
    const profile = screen.getByRole('link', { name: /Voir le profil/ });
    const bottom = sample.closest('.ep-candidature-bottom');
    expect(bottom).not.toBeNull();
    // Sample and the action group live in the same bottom row; actions hug the right edge.
    expect(bottom).toContainElement(profile);
    expect(screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' }).parentElement).toHaveStyle({
      marginLeft: 'auto',
    });
  });

  it('colours Accepter green (success) and Refuser danger — the round-2 accept/reject semantic', async () => {
    getList().mockResolvedValue(response([group()]));
    renderClient();
    await screen.findByText('« Polar nocturne »');

    const accepter = screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' });
    const refuser = screen.getByRole('button', { name: 'Refuser la candidature de Léa B.' });
    // Accept/reject now map to the shared button-color scheme: success (green) / danger (red).
    expect(accepter.className).toContain('ep-btn-success');
    expect(refuser.className).toContain('ep-btn-danger');
  });

  it('switches the active call with the selector, swapping rows and the count badge', async () => {
    getList().mockResolvedValue(
      response([
        group({ callId: 'mc7-call-nocturne', callTitle: 'Polar nocturne', applications: threeApps }),
        group({
          callId: 'call-spectres',
          callTitle: "Spectres d'Avril",
          applications: [
            application({
              id: 'b1',
              applicant: { userId: 'u-yuki', name: 'Yuki Moreau', slug: 'yuki-moreau', avatarUrl: null, role: 'dessinateur' },
            }),
          ],
        }),
      ]),
    );
    const user = userEvent.setup();
    renderClient();

    // Default: first group.
    await screen.findByText('« Polar nocturne »');
    expect(screen.getByText('3 candidatures')).toBeInTheDocument();
    expect(screen.getByText('Léa B.')).toBeInTheDocument();
    expect(screen.queryByText('Yuki Moreau')).not.toBeInTheDocument();

    // Open the on-brand selector and pick the second call.
    await user.click(screen.getByRole('combobox', { name: "Choisir l'appel" }));
    await user.click(screen.getByRole('option', { name: "« Spectres d'Avril »" }));

    expect(await screen.findByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('1 candidature')).toBeInTheDocument();
    expect(screen.queryByText('Léa B.')).not.toBeInTheDocument();
  });

  it('opens the call detail modal in-page from "Voir l\'appel" and closes on Escape', async () => {
    getList().mockResolvedValue(response([group()]));
    getDetail().mockResolvedValue(callDetail);
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: "Voir l'appel « Polar nocturne »" }));

    const dialog = await screen.findByRole('dialog');
    expect(getDetail()).toHaveBeenCalledWith('mc7-call-nocturne');
    expect(within(dialog).getByText('Un polar nocturne sous la pluie.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the current (non-first) selection across a post-edit refetch', async () => {
    const groupA = group(); // mc7-call-nocturne "Polar nocturne" (newest / groups[0])
    const groupB = group({ callId: 'call-spectres', callTitle: "Spectres d'Avril", applications: [application({ id: 'b1' })] });
    // Same groups on the initial load AND the onChanged refetch.
    getList().mockResolvedValue(response([groupA, groupB]));
    const spectresDetail: import('@encre-et-plume/shared').CallDetail = {
      ...callDetail,
      id: 'call-spectres',
      title: "Spectres d'Avril",
      isOwner: true,
      status: 'open',
    };
    getDetail().mockResolvedValue(spectresDetail);
    getUpdate().mockResolvedValue({ ...callDetail, id: 'call-spectres', title: "Spectres d'Avril" });
    const user = userEvent.setup();
    renderClient();

    // Select the SECOND (non-first) call.
    await screen.findByText('« Polar nocturne »');
    await user.click(screen.getByRole('combobox', { name: "Choisir l'appel" }));
    await user.click(screen.getByRole('option', { name: "« Spectres d'Avril »" }));
    expect(await screen.findByText("« Spectres d'Avril »")).toBeInTheDocument();

    // Open it, edit, save → triggers onChanged (refetch). Selection must survive.
    await user.click(screen.getByRole('button', { name: "Voir l'appel « Spectres d'Avril »" }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Éditer' }));
    await screen.findByRole('dialog', { name: "Modifier l'appel" });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.updateCall).toHaveBeenCalled());
    // Selector still on « Spectres d'Avril » — NOT reset to the newest « Polar nocturne ».
    expect(await screen.findByText("« Spectres d'Avril »")).toBeInTheDocument();
    expect(screen.queryByText('« Polar nocturne »')).not.toBeInTheDocument();
  });

  it('removes the deleted call from the selector after an owner delete + refetch', async () => {
    const groupB = group({
      callId: 'call-spectres',
      callTitle: "Spectres d'Avril",
      applications: [
        application({
          id: 'b1',
          applicant: { userId: 'u-yuki', name: 'Yuki Moreau', slug: 'yuki-moreau', avatarUrl: null, role: 'dessinateur' },
        }),
      ],
    });
    getList()
      .mockResolvedValueOnce(response([group(), groupB])) // initial: 2 groups
      .mockResolvedValueOnce(response([groupB])); // refetch after delete: only B remains
    getDetail().mockResolvedValue(callDetail);
    getDelete().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();

    await screen.findByText('« Polar nocturne »');
    await user.click(screen.getByRole('button', { name: "Voir l'appel « Polar nocturne »" }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(api.deleteCall).toHaveBeenCalledWith('mc7-call-nocturne'));
    // Selector now shows the remaining call; the deleted one is gone.
    expect(await screen.findByText("« Spectres d'Avril »")).toBeInTheDocument();
    expect(screen.queryByText('« Polar nocturne »')).not.toBeInTheDocument();
  });

  it('lands on the empty state when the only call is deleted', async () => {
    getList()
      .mockResolvedValueOnce(response([group()]))
      .mockResolvedValueOnce(response([]));
    getDetail().mockResolvedValue(callDetail);
    getDelete().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();

    await screen.findByText('« Polar nocturne »');
    await user.click(screen.getByRole('button', { name: "Voir l'appel « Polar nocturne »" }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(await screen.findByText('Aucune candidature reçue pour le moment.')).toBeInTheDocument();
  });

  it('accepts a pending application: disables buttons, flips the badge, announces status', async () => {
    getList().mockResolvedValue(response([group()]));
    getDecide().mockResolvedValue(application({ status: 'accepted' }));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' }));

    await waitFor(() => expect(api.decideApplication).toHaveBeenCalledWith('app-1', 'accepted'));
    expect(await screen.findByText('Acceptée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter la candidature/ })).not.toBeInTheDocument();
    const live = screen.getByRole('status', { name: /décision/i });
    expect(live).toHaveTextContent('Candidature de Léa B. acceptée.');
  });

  it('rejects a pending application and announces it', async () => {
    getList().mockResolvedValue(response([group({ applications: [application({ message: '' })] })]));
    getDecide().mockResolvedValue(application({ status: 'rejected', message: '' }));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: 'Refuser la candidature de Léa B.' }));
    await waitFor(() => expect(api.decideApplication).toHaveBeenCalledWith('app-1', 'rejected'));
    expect(await screen.findByText('Refusée')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /décision/i })).toHaveTextContent('Candidature de Léa B. refusée.');
  });

  it('shows an inline error and re-enables the buttons when a decision fails', async () => {
    getList().mockResolvedValue(response([group()]));
    getDecide().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Action impossible.');
    // Pending rows keep both actions (the proto draws no "En attente" badge on undecided rows).
    expect(screen.getByRole('button', { name: 'Accepter la candidature de Léa B.' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refuser la candidature de Léa B.' })).toBeEnabled();
  });

  it('renders a resolved (rejected) row with a badge and no action buttons', async () => {
    getList().mockResolvedValue(response([group({ applications: [application({ status: 'rejected' })] })]));
    renderClient();
    expect(await screen.findByText('Refusée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter la candidature/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refuser la candidature/ })).not.toBeInTheDocument();
  });

  it('renders a document sample as a labelled PDF link with a magnitude-appropriate size (Ko)', async () => {
    getList().mockResolvedValue(
      response([
        group({
          applications: [
            application({ samples: [{ url: 'https://cdn/doc.pdf', kind: 'document', size: 512_000 }] }),
          ],
        }),
      ]),
    );
    renderClient();
    const doc = await screen.findByRole('link', { name: /Voir l'échantillon de Léa B\./ });
    expect(doc).toHaveAttribute('href', 'https://cdn/doc.pdf');
    expect(within(doc).getByText(/PDF · 500,0 Ko/)).toBeInTheDocument();
  });

  it('shows the empty state with a link to the calls board', async () => {
    getList().mockResolvedValue(response([]));
    renderClient();
    expect(await screen.findByText('Aucune candidature reçue pour le moment.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appels à projets' })).toHaveAttribute('href', '/appels');
  });

  it('renders an error state and retries', async () => {
    getList().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(response([group()]));
    const user = userEvent.setup();
    renderClient();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les candidatures reçues.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('« Polar nocturne »')).toBeInTheDocument();
  });

  it('gates logged-out visitors with a "Se connecter" link', async () => {
    renderClient(null);
    const link = await screen.findByRole('link', { name: 'Se connecter' });
    expect(link).toHaveAttribute('href', '/connexion?redirect=/candidatures-recues');
  });

  // ─── MC-7 amendment: owner removes an applicant (any status) ──────────────────
  it('offers "Retirer" on every applicant row, including a rejected one', async () => {
    getList().mockResolvedValue(response([group({ applications: threeApps })]));
    renderClient();
    await screen.findByText('« Polar nocturne »');
    // Present on the pending row (Léa B.) and the rejected row (Diego S.).
    expect(screen.getByRole('button', { name: 'Retirer la candidature de Léa B.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la candidature de Diego S.' })).toBeInTheDocument();
  });

  it('removes an applicant via inline confirm and drops the row (optimistic)', async () => {
    getList().mockResolvedValue(response([group({ applications: threeApps })]));
    getRemove().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: 'Retirer la candidature de Léa B.' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer le retrait' }));

    await waitFor(() => expect(api.removeApplicant).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByText('Léa B.')).not.toBeInTheDocument());
    // Distinct from "Refuser": the other rows remain.
    expect(screen.getByText('Noé P.')).toBeInTheDocument();
  });

  it('rolls back the removed row and shows an inline error when the remove fails', async () => {
    getList().mockResolvedValue(response([group()]));
    getRemove().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderClient();
    await screen.findByText('« Polar nocturne »');

    await user.click(screen.getByRole('button', { name: 'Retirer la candidature de Léa B.' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer le retrait' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Action impossible.');
    // Rolled back — the applicant is still listed.
    expect(screen.getByText('Léa B.')).toBeInTheDocument();
  });
});
