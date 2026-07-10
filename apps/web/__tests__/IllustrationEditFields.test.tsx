// CS-13 FE-1 — shared IllustrationEditFields: renders the 7 labelled fields + the F-10 image slot,
// Licence is the 3-option OnBrandSelect, Visibilité is exactly Publique/Privée; the pure helpers
// initialEditValues / buildUpdateRequest map the detail and only include `image` after an upload.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IllustrationDetail, MediaResponse } from '@encre-et-plume/shared';

// Stub the F-10 upload control: shows its label + current image, and exposes a button that fires
// onUploaded with a ready Media so we can assert the image flows into onChange.
vi.mock('../components/UploadControl', () => ({
  default: ({
    label,
    currentUrl,
    onUploaded,
  }: {
    label: string;
    currentUrl?: string | null;
    onUploaded: (m: MediaResponse) => void;
  }) => (
    <div data-testid="upload-control" data-current-url={currentUrl ?? ''}>
      {label}
      <button type="button" onClick={() => onUploaded({ id: 'media-new' } as MediaResponse)}>
        FAKE_UPLOAD
      </button>
    </div>
  ),
}));

import IllustrationEditFields, {
  initialEditValues,
  buildUpdateRequest,
  type IllustrationEditValues,
} from '../components/illustration/IllustrationEditFields';

function makeDetail(overrides: Partial<IllustrationDetail> = {}): IllustrationDetail {
  return {
    id: 'ill-1', title: 'Aube', description: 'Une aube.', category: 'personnages', categoryLabel: 'Personnages',
    genres: [], hashtags: ['encre'], image: 'https://cdn/current.jpg', dimensionsLabel: '100 × 100',
    tools: 'Encre · CSP', license: null, likeCount: 0, publishedAt: '2026-01-01T00:00:00.000Z',
    artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
    is18plus: false, collections: [],
    ...overrides,
  };
}

describe('IllustrationEditFields (CS-13 FE-1)', () => {
  it('renders all 7 labelled fields plus the image-slot with the current image', () => {
    const detail = makeDetail();
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={vi.fn()}
        titleError={null}
      />,
    );
    expect(screen.getByLabelText('Titre')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Catégorie/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Hashtags')).toBeInTheDocument();
    expect(screen.getByLabelText('Outils')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Licence/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Visibilité/ })).toBeInTheDocument();
    // image slot shows the current image URL and its French label
    const slot = screen.getByTestId('upload-control');
    expect(slot).toHaveAttribute('data-current-url', 'https://cdn/current.jpg');
    expect(screen.getByText('Déposez l’illustration')).toBeInTheDocument();
  });

  it('Licence is a listbox seeded to the © default when the detail has no licence (R3)', async () => {
    const detail = makeDetail({ license: null });
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={vi.fn()}
        titleError={null}
      />,
    );
    const licence = screen.getByRole('combobox', { name: /Licence/ });
    expect(licence).toHaveTextContent('© Tous droits réservés');
    await userEvent.click(licence);
    expect(screen.getByRole('option', { name: 'CC BY' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'CC BY-NC' })).toBeInTheDocument();
  });

  it('renders a legacy licence value outside the vocabulary as the current option', () => {
    const detail = makeDetail({ license: 'Domaine public' });
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={vi.fn()}
        titleError={null}
      />,
    );
    expect(screen.getByRole('combobox', { name: /Licence/ })).toHaveTextContent('Domaine public');
  });

  it('Visibilité offers exactly Publique and Privée (R4 — no "Abonnés")', async () => {
    const detail = makeDetail();
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={vi.fn()}
        titleError={null}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: /Visibilité/ }));
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Publique', 'Privée']);
  });

  it('shows the inline title error when provided', () => {
    const detail = makeDetail();
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={vi.fn()}
        titleError="Un titre est requis"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Un titre est requis');
    expect(screen.getByLabelText('Titre')).toHaveAttribute('aria-invalid', 'true');
  });

  it('feeds an uploaded media id into onChange as `image`', async () => {
    const detail = makeDetail();
    const onChange = vi.fn();
    render(
      <IllustrationEditFields
        detail={detail}
        values={initialEditValues(detail)}
        onChange={onChange}
        titleError={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'FAKE_UPLOAD' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ image: 'media-new' }));
  });
});

describe('initialEditValues / buildUpdateRequest (CS-13 FE-1 helpers)', () => {
  it('maps publishedAt -> visibility and null licence -> © default, image null', () => {
    expect(initialEditValues(makeDetail({ publishedAt: null, license: null }))).toMatchObject({
      visibility: 'private',
      license: '© Tous droits réservés',
      image: null,
    });
    expect(initialEditValues(makeDetail({ publishedAt: '2026-01-01T00:00:00.000Z' }))).toMatchObject({
      visibility: 'public',
    });
  });

  it('trims title/tools/description and includes `image` only when set', () => {
    const base: IllustrationEditValues = {
      title: '  Crépuscule  ', category: 'personnages', description: '  ', hashtags: ['encre'],
      tools: '  Encre  ', license: 'CC BY', visibility: 'public', image: null,
    };
    expect(buildUpdateRequest(base)).toEqual({
      title: 'Crépuscule', category: 'personnages', description: null, hashtags: ['encre'],
      tools: 'Encre', license: 'CC BY', visibility: 'public',
    });
    expect(buildUpdateRequest({ ...base, image: 'media-new' })).toMatchObject({ image: 'media-new' });
  });
});
