import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// CS-24 (F-d / D-7) — the notification centre hands us a bare uuid. This route asks the API what it
// is: a correction → the review screen with it selected; anything else (CS-2 stores a PROJECT id in
// the same refId column) → exactly where those notifications land today, /projets.
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../lib/api', () => ({ getCorrectionLocation: vi.fn() }));

import * as api from '../lib/api';
import CorrectionResolver from '../components/revision/CorrectionResolver';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('CorrectionResolver', () => {
  beforeEach(() => {
    router.replace.mockClear();
    mocked.getCorrectionLocation.mockReset();
  });

  it('redirects a correction id to the review screen with that correction selected', async () => {
    mocked.getCorrectionLocation.mockResolvedValue({ projectSlug: 'lames-de-brume', pageId: 'page-1', type: 'dessin', assetId: null });
    render(<CorrectionResolver id="corr-1" />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/projet/lames-de-brume/revision/page-1?correction=corr-1'),
    );
  });

  it('falls back to /projets when the id is not a correction (CS-2 project-activity shape)', async () => {
    mocked.getCorrectionLocation.mockRejectedValue({ statusCode: 404, message: 'Demande introuvable' });
    render(<CorrectionResolver id="proj-1" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projets'));
  });

  it('announces the redirection while it resolves', () => {
    mocked.getCorrectionLocation.mockReturnValue(new Promise(() => {}));
    render(<CorrectionResolver id="corr-1" />);
    expect(screen.getByRole('status').textContent).toContain('Ouverture de la correction');
  });

  // CS-24 follow-up — a `scenario` correction is a tagged CS-4 comment; the review list is dessin-only
  // (CS-5 r4), so /revision could never show it. It belongs in the editor, on its own asset.
  it('routes a scenario correction to the editor, not the dessin-only review list', async () => {
    mocked.getCorrectionLocation.mockResolvedValue({
      projectSlug: 'lames-de-brume',
      pageId: 'page-1',
      type: 'scenario',
      assetId: 'asset-9',
    });
    render(<CorrectionResolver id="corr-1" />);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/projet/lames-de-brume/editeur/page-1?asset=asset-9'),
    );
  });
});
