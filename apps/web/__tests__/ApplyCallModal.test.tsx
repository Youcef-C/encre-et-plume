import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CallCard, PortfolioItemResponse, MediaResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getMe: vi.fn(),
  getProfile: vi.fn(),
  getProfilePortfolio: vi.fn(),
  applyToCall: vi.fn(),
  updateMyApplication: vi.fn(),
}));

// Mock the single combined UploadControl — exposes an "upload image" and an "upload doc" button, each
// firing onUploaded with a MediaResponse carrying the routed `kind` (the parent reads media.kind), plus
// a "busy" button firing onBusyChange, so tests drive the flow without the real presign path.
vi.mock('../components/UploadControl', () => ({
  default: ({
    onUploaded,
    onBusyChange,
  }: {
    onUploaded: (m: MediaResponse, filename?: string) => void;
    onBusyChange?: (b: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onUploaded({ id: 'media-img', kind: 'application_sample', variants: { thumb: 'https://cdn/thumb.jpg' } } as unknown as MediaResponse)
        }
      >
        upload image
      </button>
      <button
        type="button"
        onClick={() => onUploaded({ id: 'media-doc', kind: 'application_document', variants: {} } as MediaResponse, 'scenario.pdf')}
      >
        upload doc
      </button>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        busy
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
  authorAvatar: null,
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
  myApplicationStatus: null,
  viewerHasRole: true,
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
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
  // Single-role by default (dessinateur) — the multi-role chooser stays hidden.
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
    expect(screen.getByText(/« Lames de Brume »/)).toBeInTheDocument();
  });

  it('renders the message section before the sample section (prototype DOM order)', async () => {
    open();
    const message = screen.getByText('VOTRE MESSAGE');
    const sample = await screen.findByText('JOINDRE UN ÉCHANTILLON');
    expect(message.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no "Je candidate en tant que :" chooser for a single-intersection call', async () => {
    open();
    await screen.findByRole('button', { name: /Encre nocturne/ });
    expect(screen.queryByText('Je candidate en tant que :')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dessinateur·rice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scénariste' })).not.toBeInTheDocument();
  });

  // req6: the chooser appears only when the call seeks >1 role the viewer also holds.
  it('shows the role chooser and sends appliedAs on a multi-role call the viewer dual-holds', async () => {
    getProfile().mockResolvedValue({ creatorRoles: ['scenariste', 'dessinateur'] });
    const user = userEvent.setup();
    render(
      <ApplyCallModal
        call={{ ...call, seekingRoles: ['dessinateur', 'scenariste'] }}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    await screen.findByText('Je candidate en tant que :');
    // Default = the first intersection role.
    expect(screen.getByRole('button', { name: 'Dessinateur·rice' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Scénariste' }));
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samples: [{ portfolioItemId: 'pf-1' }],
        appliedAs: 'scenariste',
      }),
    );
  });

  it('shows the sample counter starting at 0/3', async () => {
    open();
    await screen.findByRole('button', { name: /Encre nocturne/ });
    expect(screen.getByText('0/3')).toBeInTheDocument();
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

  it('posts the picked portfolio item as a samples[] ref with the message (no appliedAs)', async () => {
    const user = userEvent.setup();
    const { onApplied } = open();
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.type(screen.getByLabelText('VOTRE MESSAGE'), 'Bonjour !');
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));

    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samples: [{ portfolioItemId: 'pf-1' }],
        message: 'Bonjour !',
      }),
    );
    expect(await screen.findByText('Candidature envoyée !')).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalledWith('call-1', 'app-1');
  });

  it('posts an uploaded image as a samples[] media ref', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'upload image' }));
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', { samples: [{ mediaId: 'media-img' }] }),
    );
  });

  it('posts an uploaded PDF as a samples[] media ref and lists its filename', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'upload doc' }));
    expect(await screen.findByText('✓ scenario.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', { samples: [{ mediaId: 'media-doc' }] }),
    );
  });

  it('accepts up to 3 mixed samples, updates the counter and hides the adders at the cap', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'upload image' }));
    await user.click(screen.getByRole('button', { name: 'upload doc' }));
    expect(await screen.findByText('3/3')).toBeInTheDocument();
    expect(screen.getByText('Maximum 3 échantillons.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'upload image' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
    await waitFor(() =>
      expect(api.applyToCall).toHaveBeenCalledWith('call-1', {
        samples: [{ portfolioItemId: 'pf-1' }, { mediaId: 'media-img' }, { mediaId: 'media-doc' }],
      }),
    );
  });

  it('removes an uploaded sample from the list', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'upload doc' }));
    expect(await screen.findByText('✓ scenario.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer cet échantillon' }));
    expect(screen.queryByText('✓ scenario.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('0/3')).toBeInTheDocument();
  });

  it('shows only the file adders when the portfolio is empty (no thumbnails)', async () => {
    getPortfolio().mockResolvedValue([]);
    open();
    expect(await screen.findByRole('button', { name: 'upload image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Échantillon/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'busy' }));
    expect(screen.getByRole('button', { name: 'Envoyer ma candidature' })).toBeDisabled();
  });

  // MC-5 amendment: reaching the sample cap must NOT disable submit. Reproduces the real bug — the
  // upload control unmounts at MAX, so its onBusyChange(false) can never fire and a lingering busy=true
  // would otherwise wedge the button. At MAX (no upload control), submit must stay enabled.
  it('keeps "Envoyer" enabled at exactly the max samples even with a lingering upload-busy flag', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'busy' })); // uploadBusy → true
    await user.click(screen.getByRole('button', { name: /Encre nocturne/ }));
    await user.click(screen.getByRole('button', { name: 'upload image' }));
    await user.click(screen.getByRole('button', { name: 'upload doc' }));
    expect(await screen.findByText('3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer ma candidature' })).toBeEnabled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  // ─── MC-6 amendment: edit a PENDING application (reuses this modal) ────────────
  describe('edit mode', () => {
    beforeEach(() => {
      (api.updateMyApplication as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'app-9', callId: 'call-1' });
    });

    it('titles the dialog "Modifier ma candidature", pre-fills the message and labels submit "Enregistrer"', async () => {
      render(
        <ApplyCallModal
          call={call}
          edit={{ applicationId: 'app-9', initialMessage: 'Texte initial', initialSamples: [] }}
          onClose={vi.fn()}
          onApplied={vi.fn()}
        />,
      );
      expect(await screen.findByRole('dialog', { name: 'Modifier ma candidature' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('Texte initial')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Envoyer ma candidature' })).not.toBeInTheDocument();
    });

    it('saves via updateMyApplication with the samples + message and fires onApplied', async () => {
      const user = userEvent.setup();
      const onApplied = vi.fn();
      render(
        <ApplyCallModal
          call={call}
          edit={{ applicationId: 'app-9', initialMessage: 'Texte initial', initialSamples: [] }}
          onClose={vi.fn()}
          onApplied={onApplied}
        />,
      );
      await user.click(await screen.findByRole('button', { name: /Encre nocturne/ }));
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateMyApplication).toHaveBeenCalledWith('app-9', {
          samples: [{ portfolioItemId: 'pf-1' }],
          message: 'Texte initial',
        }),
      );
      expect(api.applyToCall).not.toHaveBeenCalled();
      expect(onApplied).toHaveBeenCalledWith('call-1', 'app-9');
    });

    // MC-6 #7: existing samples come back from the detail with their ref → pre-fill + re-submit, no re-upload.
    it('pre-fills existing samples from the detail refs and re-submits them (portfolio + media) unchanged', async () => {
      const user = userEvent.setup();
      render(
        <ApplyCallModal
          call={call}
          edit={{
            applicationId: 'app-9',
            initialMessage: 'Texte initial',
            initialSamples: [
              { url: 'https://cdn/pf.jpg', kind: 'image', size: null, portfolioItemId: 'pf-1' },
              { url: 'https://cdn/up.jpg', kind: 'image', size: null, mediaId: 'media-x' },
            ],
          }}
          onClose={vi.fn()}
          onApplied={vi.fn()}
        />,
      );
      // Both pre-filled samples counted; the portfolio one shows selected, the media one as an upload chip.
      expect(await screen.findByText('2/3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Encre nocturne/ })).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateMyApplication).toHaveBeenCalledWith('app-9', {
          samples: [{ portfolioItemId: 'pf-1' }, { mediaId: 'media-x' }],
          message: 'Texte initial',
        }),
      );
    });

    it('lets the applicant remove a pre-filled sample before saving', async () => {
      const user = userEvent.setup();
      render(
        <ApplyCallModal
          call={call}
          edit={{
            applicationId: 'app-9',
            initialMessage: '',
            initialSamples: [
              { url: 'https://cdn/pf.jpg', kind: 'image', size: null, portfolioItemId: 'pf-1' },
              { url: 'https://cdn/up.jpg', kind: 'image', size: null, mediaId: 'media-x' },
            ],
          }}
          onClose={vi.fn()}
          onApplied={vi.fn()}
        />,
      );
      expect(await screen.findByText('2/3')).toBeInTheDocument();
      // Drop the uploaded (media) sample; the portfolio one stays.
      await user.click(screen.getByRole('button', { name: 'Retirer cet échantillon' }));
      expect(await screen.findByText('1/3')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(api.updateMyApplication).toHaveBeenCalledWith('app-9', { samples: [{ portfolioItemId: 'pf-1' }] }),
      );
    });
  });
});
