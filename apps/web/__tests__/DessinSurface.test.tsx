import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CorrectionDto } from '@encre-et-plume/shared';
import DessinSurface from '../components/revision/DessinSurface';
import Composer from '../components/revision/Composer';

const dessin = (over: Partial<CorrectionDto> = {}): CorrectionDto => ({
  id: 'c1',
  pageId: 'p1',
  assetId: 'a1',
  type: 'dessin',
  anchor: { region: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 } },
  caseRef: 'case 1',
  description: 'Agrandir le plan.',
  status: 'a_corriger',
  authorId: 'me',
  authorName: 'Camille',
  assigneeId: null,
  filedAgainstVersion: 2,
  resolvedInVersion: null,
  // CS-24 — the verification columns (unused by the surface, required by the DTO).
  resolvedById: null,
  resolvedByName: null,
  verifiedAt: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  ...over,
});

const surfaceProps = {
  numberOf: () => 1,
  selectedId: null,
  onSelect: vi.fn(),
  draftRegion: null,
  onDrawRegion: vi.fn(),
};

describe('DessinSurface', () => {
  it('renders a box per dessin correction, positioned from the normalized region and announcing status + number', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[dessin()]}
      />,
    );
    const box = screen.getByRole('button', { name: /Correction 1 — À corriger/i });
    expect(box.style.left).toBe('10%');
    expect(box.style.top).toBe('20%');
    expect(box.style.width).toBe('30%');
  });

  it('shows the side-by-side compare when a newer version exists', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/old.png"
        toImageUrl="https://cdn/new.png"
        fromVersion={2}
        toVersion={3}
        corrections={[dessin()]}
      />,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBe(2);
  });

  // F2 — a mouse press on the armed surface must FOCUS it (the handler preventDefaults, which would
  // otherwise suppress the browser's click-to-focus and hide the "Entrée pour un cadre centré" fallback).
  it('focuses the draw surface on pointer-down so the keyboard fallback is reachable by click', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    const surface = screen.getByRole('application', { name: /Tracer une zone/i });
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(document.activeElement).toBe(surface);
  });

  // C (r3) — the reviewed image is fitted to the viewport keeping aspect ratio (max-height + contain),
  // and the draw surface shrink-wraps the image so normalized 0–1 coords stay exact against it.
  it('fits the reviewed image to the viewport keeping aspect ratio, and the draw surface wraps it', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    const img = screen.getByRole('img', { name: /Planche révisée/i }) as HTMLImageElement;
    expect(img.style.maxHeight).not.toBe('');
    expect(img.style.objectFit).toBe('contain');
    const surface = screen.getByRole('application', { name: /Tracer une zone/i });
    // The surface shrink-wraps the fitted image (inline-block) so % coords match the rendered pixels.
    expect(surface.style.display).toBe('inline-block');
  });

  // C (r3) — pointer-down on the armed surface must NOT scroll the surface into view (no camera snap):
  // the focus call passes { preventScroll: true }.
  it('focuses the draw surface without scrolling it into view (no camera snap)', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    const surface = screen.getByRole('application', { name: /Tracer une zone/i }) as HTMLDivElement;
    const focusSpy = vi.spyOn(surface, 'focus');
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  // Item 3 (iter 5) — the bordered frame HUGS the image (no letterbox): the image box shrink-wraps its
  // image (not flex:1), so the ink border sits on the fitted image bounds.
  it('makes the image frame hug the fitted image (no flex-grow letterbox)', () => {
    const { container } = render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    const frame = container.querySelector('.ep-dessin-frame') as HTMLElement;
    expect(frame).toBeTruthy();
    // Hugs the content — it does not stretch to fill the row.
    expect(frame.style.flex).not.toBe('1');
    expect(frame.style.border).toContain('3px');
  });

  // Item 6 (iter 5) — a not-yet-submitted draft box is movable. Keyboard: arrow keys reposition it,
  // keeping normalized 0–1 coords (and clamped to the image bounds).
  it('exposes a movable draft box and moves it right on ArrowRight (coords stay 0–1)', () => {
    const onDrawRegion = vi.fn();
    render(
      <DessinSurface
        {...surfaceProps}
        onDrawRegion={onDrawRegion}
        draftRegion={{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    const mover = screen.getByRole('button', { name: /Déplacer la zone/i });
    fireEvent.keyDown(mover, { key: 'ArrowRight' });
    expect(onDrawRegion).toHaveBeenCalledTimes(1);
    const r = onDrawRegion.mock.calls[0][0];
    expect(r.x).toBeGreaterThan(0.4);
    expect(r.w).toBe(0.2); // size unchanged
    expect(r.x + r.w).toBeLessThanOrEqual(1);
  });

  it('clamps the draft box at the left edge on ArrowLeft', () => {
    const onDrawRegion = vi.fn();
    render(
      <DessinSurface
        {...surfaceProps}
        onDrawRegion={onDrawRegion}
        draftRegion={{ x: 0.01, y: 0.4, w: 0.2, h: 0.2 }}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Déplacer la zone/i }), { key: 'ArrowLeft' });
    const r = onDrawRegion.mock.calls[0][0];
    expect(r.x).toBe(0);
  });

  it('shows an empty note when no dessin file is linked', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl={null}
        toImageUrl={null}
        fromVersion={0}
        toVersion={0}
        corrections={[]}
      />,
    );
    expect(screen.getByText(/Aucun fichier dessin/i)).toBeTruthy();
  });

  // A1 (iter 6) — the composer is ALWAYS active: no "Nouvelle correction" toggle, and the draw surface
  // is present (role application) without any drawing prop.
  it('is always active: no "Nouvelle correction" toggle, surface always drawable', () => {
    render(
      <DessinSurface
        {...surfaceProps}
        fromImageUrl="https://cdn/x.png"
        toImageUrl={null}
        fromVersion={2}
        toVersion={2}
        corrections={[]}
      />,
    );
    expect(screen.queryByRole('button', { name: /Nouvelle correction/i })).toBeNull();
    const surface = screen.getByRole('application', { name: /Tracer une zone/i });
    expect(surface.style.cursor).toBe('crosshair');
  });
});

describe('Composer (dessin)', () => {
  const base = {
    draftRegion: null,
    onClearRegion: vi.fn(),
    busy: false,
    // Follow-up 6 — the project members from the review payload feed the assignee picker.
    members: [
      { accountId: 'acc-yuki', displayName: 'Yuki', avatar: null },
      { accountId: 'acc-rin', displayName: 'Rin', avatar: null },
    ],
  };

  // A2 (iter 6) — dessin is the only type here, so no "Type :" row / Scénario·Dessin chips.
  it('shows no "type" row (dessin-only)', () => {
    render(<Composer {...base} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/Type ?:/)).toBeNull();
    expect(screen.queryByText('Scénario')).toBeNull();
  });

  // A3 (iter 6) — the description textarea is white (--card), not the paper tone.
  it('renders a white (--card) textarea', () => {
    render(<Composer {...base} onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText(/Décrire la correction/i) as HTMLTextAreaElement;
    expect(ta.style.background).toBe('var(--card)');
  });

  it('requires a drawn region before submitting', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...base} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Décrire la correction/i), 'Agrandir');
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    expect(screen.getByText(/Tracez d’abord un cadre|Tracez d'abord un cadre/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a description before submitting', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Composer {...base} draftRegion={{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    expect(screen.getByText(/Description requise/i)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the description when both region and text are present', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Composer {...base} draftRegion={{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Décrire la correction/i), 'Agrandir le plan');
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    // Follow-up 6 — the second argument is the assignee; « Non assignée » is null.
    expect(onSubmit).toHaveBeenCalledWith('Agrandir le plan', null);
  });

  // Follow-up 6 (CS-24) — without a picker, only the filer can ever mark their own correction
  // « Corrigé », so the CS-24 verification loop can never fire. This is that picker.
  it('lists the payload members plus a « Non assignée » default (OnBrandSelect, no native select)', async () => {
    const user = userEvent.setup();
    render(<Composer {...base} onSubmit={vi.fn()} />);
    expect(document.querySelector('select')).toBeNull();
    const trigger = screen.getByRole('combobox', { name: 'Assignée à' });
    expect(trigger).toHaveTextContent('Non assignée');
    await user.click(trigger);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Non assignée', 'Yuki', 'Rin']);
  });

  it('sends the chosen member as assigneeId', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Composer {...base} draftRegion={{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('combobox', { name: 'Assignée à' }));
    await user.click(screen.getByRole('option', { name: 'Rin' }));
    await user.type(screen.getByLabelText(/Décrire la correction/i), 'Retoucher la trame');
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    expect(onSubmit).toHaveBeenCalledWith('Retoucher la trame', 'acc-rin');
  });

  it('resets the picker to « Non assignée » after a successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Composer {...base} draftRegion={{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('combobox', { name: 'Assignée à' }));
    await user.click(screen.getByRole('option', { name: 'Yuki' }));
    await user.type(screen.getByLabelText(/Décrire la correction/i), 'Retoucher');
    await user.click(screen.getByRole('button', { name: 'Demander' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Assignée à' })).toHaveTextContent('Non assignée'));
  });
});

// ── CS-25 · New-version triage ────────────────────────────────────────────────
// The walkthrough draws the current correction's region on BOTH panes from the same normalized
// coordinates, dims the rest, suppresses drawing, and adds an opacity-only onion-skin. NO pixel diff.
describe('DessinSurface — CS-25 triage', () => {
  const twoPanes = {
    ...surfaceProps,
    fromImageUrl: 'https://cdn/old.png',
    toImageUrl: 'https://cdn/new.png',
    fromVersion: 2,
    toVersion: 3,
  };

  it('draws the active region on both panes at identical coordinates', () => {
    const { container } = render(<DessinSurface {...twoPanes} corrections={[dessin()]} activeId="c1" />);
    const boxes = Array.from(container.querySelectorAll('[data-correction-id="c1"]')) as HTMLElement[];
    expect(boxes.length).toBe(2);
    const [a, b] = boxes;
    expect(b.style.left).toBe(a.style.left);
    expect(b.style.top).toBe(a.style.top);
    expect(b.style.width).toBe(a.style.width);
    expect(b.style.height).toBe(a.style.height);
    expect(a.style.left).toBe('10%');
  });

  it('dims every box except the active one while walking', () => {
    const { container } = render(
      <DessinSurface {...twoPanes} corrections={[dessin(), dessin({ id: 'c2' })]} activeId="c1" numberOf={(id) => (id === 'c1' ? 1 : 2)} />,
    );
    const active = container.querySelector('[data-correction-id="c1"]') as HTMLElement;
    const other = container.querySelector('[data-correction-id="c2"]') as HTMLElement;
    expect(active.style.opacity).toBe('1');
    expect(other.style.opacity).toBe('0.25');
  });

  it('suppresses drawing while the walkthrough owns the surface (no phantom region)', () => {
    const onDrawRegion = vi.fn();
    const { container } = render(
      <DessinSurface {...twoPanes} onDrawRegion={onDrawRegion} corrections={[dessin()]} activeId="c1" interactive={false} />,
    );
    expect(screen.queryByRole('application', { name: /Tracer une zone/i })).toBeNull();
    const surface = container.querySelector('[data-dessin-surface]') as HTMLElement;
    fireEvent.pointerDown(surface, { clientX: 4, clientY: 4, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 90, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    fireEvent.keyDown(surface, { key: 'Enter' });
    expect(onDrawRegion).not.toHaveBeenCalled();
  });

  it('fades the new version over the old with opacity only — both images untouched, no canvas', () => {
    const { container } = render(<DessinSurface {...twoPanes} corrections={[]} />);
    const slider = screen.getByLabelText(/Fondu v2 → v3/) as HTMLInputElement;
    expect(slider.type).toBe('range');
    const overlay = container.querySelector('[data-onion-skin]') as HTMLImageElement;
    const srcsBefore = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    fireEvent.change(slider, { target: { value: '60' } });
    expect(overlay.style.opacity).toBe('0.6');
    expect(screen.getByText('60 %')).toBeTruthy();
    expect(Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(srcsBefore);
    expect(container.querySelector('canvas')).toBeNull();
    expect(overlay.style.mixBlendMode || '').toBe('');
  });

  it('offers no onion-skin when there is no newer version to fade in', () => {
    render(<DessinSurface {...surfaceProps} fromImageUrl="https://cdn/x.png" toImageUrl={null} fromVersion={2} toVersion={2} corrections={[]} />);
    expect(screen.queryByLabelText(/Fondu/)).toBeNull();
  });
});
