import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewFileItem, ReviewVersionItem } from '@encre-et-plume/shared';

// The reworked header (Fb-1) hosts the PageSwitcher, which reads the App-Router hooks.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import ReviewHeader from '../components/revision/ReviewHeader';

const files: ReviewFileItem[] = [
  { assetId: 'a1', filename: 'nemu-planche4.png', type: 'dessin', surface: 'dessin', currentVersion: 3 },
];
const versions: ReviewVersionItem[] = [
  // CS-24 — ReviewVersionItem now carries the version's signed URL (dessin surface only).
  { version: 3, authorName: 'Camille', createdAt: '2026-07-14T10:00:00.000Z', note: null, url: null },
  { version: 2, authorName: 'Camille', createdAt: '2026-07-13T10:00:00.000Z', note: null, url: null },
];

const base = {
  slug: 'lueur',
  pageId: 'pg1',
  projectTitle: 'Lueur d’encre',
  pageTitle: 'Planche 4',
  files,
  selectedFile: 'a1',
  onSelectFile: vi.fn(),
  versions,
  fromVersion: 2,
  toVersion: 3,
  onFrom: vi.fn(),
  onTo: vi.fn(),
  members: [],
  onValidate: vi.fn(),
  validating: false,
  validateError: null,
};

describe('ReviewHeader', () => {
  it('renders the prototype-verbatim header copy', () => {
    render(<ReviewHeader {...base} allCorrige={false} />);
    expect(screen.getByText('Révision · corrections')).toBeTruthy();
    expect(screen.getByText('En révision')).toBeTruthy();
  });

  // r4 — dessin-only revision page: the Scénario/Dessin surface toggle is gone.
  it('renders no Scénario/Dessin surface toggle (dessin-only)', () => {
    render(<ReviewHeader {...base} allCorrige={false} />);
    expect(screen.queryByRole('radiogroup', { name: 'Surface de révision' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Scénario' })).toBeNull();
  });

  it('disables "Valider les modifications" until every correction is corrigé', () => {
    render(<ReviewHeader {...base} allCorrige={false} />);
    const btn = screen.getByRole('button', { name: /Valider les modifications/i });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('enables validate when all corrections are corrigé and calls onValidate', async () => {
    const onValidate = vi.fn();
    const user = userEvent.setup();
    render(<ReviewHeader {...base} allCorrige onValidate={onValidate} />);
    const btn = screen.getByRole('button', { name: /Valider les modifications/i });
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(btn);
    expect(onValidate).toHaveBeenCalled();
  });

  // Fb-1 — the reworked header is app-native chrome: project title, the PageSwitcher, and the
  // "Ouvrir l'éditeur" cross-link, on top of the ‹ Projet back link.
  it('renders the app-native editor chrome (project title, PageSwitcher, Ouvrir l’éditeur)', () => {
    render(<ReviewHeader {...base} allCorrige={false} />);
    expect(screen.getByText('Lueur d’encre')).toBeTruthy();
    expect(screen.getByRole('link', { name: '‹ Projet' })).toHaveAttribute('href', '/projet/lueur');
    // PageSwitcher trigger carries the page title.
    expect(screen.getByRole('button', { name: /Planche 4/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ouvrir l’éditeur/ })).toHaveAttribute('href', '/projet/lueur/editeur/pg1');
  });
});
