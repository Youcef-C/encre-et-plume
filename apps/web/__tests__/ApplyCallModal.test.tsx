import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CallCard, PortfolioItemResponse, MediaResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getMe: vi.fn(),
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn(),
  applyToCall: vi.fn(),
}));

// Mock UploadControl — the file adder is always inline (no mode toggle). Exposes buttons to drive
// onUploaded / onBusyChange without the real presign flow.
vi.mock('../components/UploadControl', () => ({
  default: ({
    onUploaded,
    onBusyChange,
  }: {
    onUploaded: (m: MediaResponse) => void;
    onBusyChange?: (b: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onUploaded({ id: 'media-9' } as MediaResponse)}>
        mock-uploaded
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        mock-busy
      </button>
    </div>
  ),
}));

import * as api from '../lib/api';
import ApplyCallModal from '../components/appels/ApplyCallModal';

const call: CallCard = {
  id: 'call-1',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: '« Lames de Brume »',
  tags: ['Seinen'],
  authorName: 'Camille R.',
  closesInDays: 12,
  applicationCount: 5,
  direction: 'writerSeeksIllustrator',
  description: 'Un thriller urbain.',
  sampleUrl: null,
  status: 'open',
  deadline: '2026-07-19T00:00:00.000Z',
  isOwner: false,
  hasApplied: false,
  myApplicationId: null,
};

const me = { slug: 'yuki-moreau' } as AccountSummary;

const items: PortfolioItemResponse[] = [
  { id: 'pf-1', image: 'https://cdn/1.jpg', caption: 'Encre nocturne', order: 0 },
  { id: 'pf-2', image: 'https://cdn/2.jpg', caption: null, order: 1 },
];

const getMe = () => api.getMe as ReturnType<typeof vi.fn>;
const getProfile = () => api.getProfile as ReturnType<typeof vi.fn>;
const getPortfolio = () => api.getProfilePortfolio as ReturnType<typeof vi.fn>;
const apply = () => api.applyToCall as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getMe().mockResolvedValue(me);
  // Single-role by default — the "Je candidate en tant que :" toggle stays hidden.
  getProfile().mockResolvedValue({ creatorRoles: ['dessinateur'] });
  getPortfolio().mockResolvedValue(items);
  apply().mockResolvedValue({ id: 'app-1', callId: 'call-1' });
});

function open(overrides: Partial<Parameters<typeof ApplyCallModal>[0]> = {}) {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(<ApplyCallModal call={call} onClose={onClose} onApplied={onApplied} {...overrides} />);
  return { onClose, onApplied };
}

describe('ApplyCallModal', () => {
  it('renders a labelled modal dialog and moves focus into it', async () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Candidater' });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(dialog).toHaveFocus());
    // The call being applied to is named for the applicant.
    expect(screen.getByText(/« Lames de Brume »/)).toBeInTheDocument();
  });

  it('renders the message section before the sample section (prototype DOM order)', async () => {
    open();
    const message = screen.getByText('VOTRE MESSAGE');
    const sample = await screen.findByText('JOINDRE UN ÉCHANTILLON');
    // Node.DOCUMENT_POSITION_FOLLOWING (4) — message precedes sample in document order.
    expect(message.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows portfolio thumbnails and the file adder together, with no mode-toggle chips', async () => {
    open();
    await screen.findByRole('button', { name: /Encre nocturne/ });
    // File adder (mock UploadControl) is present at the same time — no switching.
    expect(screen.getByRole('button', { name: 'mock-uploaded' })).toBeInTheDocument();
    // The invented toggle chips must not exist.
    expect(screen.queryByRole('button', { name: 'Mon portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Téléverser un fichier' })).not.toBeInTheDocument();
  });

  it('blocks submit and shows the sample-required message when no sample is chosen', async () => {
    const user = userEvent.setup();
    const { onApplied } = open();
    await screen.findByRole('button', { name: /Encre nocturne/ });
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    expect(await screen.findByText('Ajoutez un échantillon de votre travail.')).toBeInTheDocument();
    expect(api.applyToCall).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('posts the picked portfolio item and message, then confirms and fires onApplied', async () => {
    const user = userEvent.setup();
    const { onApplied } = open();
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.type(screen.getByLabelText('VOTRE MESSAGE'), 'Bonjour !');
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));

    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samplePortfolioItemId: 'pf-1',
        message: 'Bonjour !',
      }),
    );
    expect(await screen.findByText('Candidature envoyée !')).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalledWith('call-1', 'app-1');
  });

  it('shows only the file adder when the portfolio is empty (no thumbnails)', async () => {
    getPortfolio().mockResolvedValue([]);
    open();
    // File adder present…
    expect(await screen.findByRole('button', { name: 'mock-uploaded' })).toBeInTheDocument();
    // …and no portfolio thumbnails.
    expect(screen.queryByRole('button', { name: /Échantillon/ })).not.toBeInTheDocument();
  });

  it('posts an uploaded media id via the file adder (upload wins over portfolio)', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'mock-uploaded' }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', { sampleMediaId: 'media-9' }),
    );
  });

  it('surfaces the server French error message in an alert (closed / duplicate 409)', async () => {
    apply().mockRejectedValue({ statusCode: 409, message: 'Cet appel est clôturé.', error: 'CONFLICT' });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cet appel est clôturé.');
  });

  it('disables submit while an upload is in progress', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'mock-busy' }));
    expect(screen.getByRole('button', { name: 'Envoyer ma candidature' })).toBeDisabled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  // Owner addition (MC-6): dual-role applicants pick which role they apply as.
  it('hides the apply-as toggle for a single-role applicant and sends no appliedAs', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    expect(screen.queryByText('Je candidate en tant que :')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', { samplePortfolioItemId: 'pf-1' }),
    );
  });

  it('shows the toggle for a dual-role applicant, defaults to the sought role, and sends appliedAs', async () => {
    getProfile().mockResolvedValue({ creatorRoles: ['scenariste', 'dessinateur'] });
    const user = userEvent.setup();
    open(); // call sought role = dessinateur (writerSeeksIllustrator)
    await screen.findByText('Je candidate en tant que :');
    // Default = the sought role.
    expect(screen.getByRole('button', { name: 'Dessinateur·rice' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Scénariste' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samplePortfolioItemId: 'pf-1',
        appliedAs: 'dessinateur',
      }),
    );
  });

  it('sends the switched role when the dual-role applicant flips the toggle', async () => {
    getProfile().mockResolvedValue({ creatorRoles: ['scenariste', 'dessinateur'] });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Scénariste' }));
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samplePortfolioItemId: 'pf-1',
        appliedAs: 'scenariste',
      }),
    );
  });
});
