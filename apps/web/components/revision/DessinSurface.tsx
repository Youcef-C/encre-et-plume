'use client';

// CS-5 — Dessin surface: region-annotated nemu (prototype line 1661). Numbered status-coloured boxes
// over the reviewed image; the draw-a-box composer is ALWAYS active (iter 6 A1 — no "Nouvelle
// correction" toggle): a drag places a new normalized (0–1) region and the committed draft box stays
// movable. Side-by-side old(with boxes) ↔ new compare when a newer version exists. NO pixel-diff.
import { useId, useRef, useState, type CSSProperties } from 'react';
import { CORRECTION_STATUS_LABELS, type CorrectionDto, type DessinRegion } from '@encre-et-plume/shared';
import { statusColor } from './shared';

export interface DessinSurfaceProps {
  fromImageUrl: string | null;
  toImageUrl: string | null;
  fromVersion: number;
  toVersion: number;
  corrections: CorrectionDto[]; // dessin corrections for this file
  numberOf: (id: string) => number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  draftRegion: DessinRegion | null;
  onDrawRegion: (r: DessinRegion | null) => void;
  // CS-25 — walkthrough: the correction being triaged. Its box is drawn on BOTH panes and everything
  // else is dimmed. null = normal review mode (no dimming).
  activeId?: string | null;
  // CS-25 — false while the walkthrough owns the surface: drawing/moving is suppressed so a stray drag
  // mid-triage can't file a phantom region.
  interactive?: boolean;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const MOVE_STEP = 0.02; // keyboard nudge (2% of the image) for the movable draft box

// Item 3 (iter 5) — the frame HUGS the fitted image: `flex:0 1 auto` (not flex:1) so the box shrink-wraps
// its image instead of stretching and letterboxing; the ink border then sits exactly on the image bounds.
const imgWrap: CSSProperties = { position: 'relative', flex: '0 1 auto', minWidth: 0, maxWidth: '100%', border: '3px solid var(--ink)', background: 'var(--card)' };
// C (r3) + Item 3 (iter 5) — the nemu is fitted to the viewport keeping its aspect ratio (object-fit:
// contain, no forced width) so a tall planche never overflows and the image stays STABLE. The max-height
// is capped so the WHOLE surface (button row + frame + composer) fits without scrolling on desktop; it
// floors at 220px and never exceeds 78vh. The draw surface (below) shrink-wraps this fitted box, so
// normalized 0–1 coords stay exact against the rendered pixels (no letterbox offset).
const fittedImg: CSSProperties = { display: 'block', maxWidth: '100%', maxHeight: 'clamp(220px, calc(100dvh - 300px), 78vh)', width: 'auto', height: 'auto', objectFit: 'contain' };

export default function DessinSurface({
  fromImageUrl,
  toImageUrl,
  fromVersion,
  toVersion,
  corrections,
  numberOf,
  selectedId,
  onSelect,
  draftRegion,
  onDrawRegion,
  activeId = null,
  interactive = true,
}: DessinSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; r: DessinRegion } | null>(null);
  // Item 6 (iter 5) — moving the not-yet-submitted draft box. Tracks the pointer origin + the region
  // at grab time; each move re-derives the region from the delta (coords stay normalized 0–1).
  const [moveDrag, setMoveDrag] = useState<{ px: number; py: number; r: DessinRegion } | null>(null);
  // CS-25 — onion-skin: a viewing control, NOT a pixel diff. It only drives the opacity of a second
  // <img> of the new version laid over the old one; both images are untouched (no canvas, no blend).
  const [fade, setFade] = useState(0);
  const fadeId = useId();
  const hasNewer = toImageUrl != null && toVersion > fromVersion;
  // Keep the box fully on the image: x ∈ [0, 1−w], y ∈ [0, 1−h].
  const clampPos = (v: number, size: number) => Math.min(1 - size, Math.max(0, v));

  if (!fromImageUrl) {
    return (
      <div style={{ padding: 24, color: 'var(--ink2)', fontStyle: 'italic', fontSize: 14 }}>
        Aucun fichier dessin lié à cette carte.
      </div>
    );
  }

  const toRegion = (clientX: number, clientY: number, el: HTMLDivElement) => {
    const b = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (clientY - b.top) / b.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A1 — the surface is always drawable (no toggle gate). A press on empty image starts a new box.
    if (!interactive || !surfaceRef.current) return;
    e.preventDefault();
    // F2 — preventDefault suppresses the browser's click-to-focus; focus explicitly so a click-then-Enter
    // reaches the keyboard fallback (Entrée pour un cadre centré), not only Tab navigation.
    // C (r3) — { preventScroll: true }: focusing the surface must NOT scroll it into view. That
    // scroll-into-view was the "camera autosnaps and messes up everything" on box start (feedback C).
    surfaceRef.current.focus({ preventScroll: true });
    const { x, y } = toRegion(e.clientX, e.clientY, surfaceRef.current);
    setDrag({ x0: x, y0: y, r: { x, y, w: 0, h: 0 } });
    try {
      surfaceRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture unsupported (jsdom / no active pointer) — drawing still works via move/up */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !drag || !surfaceRef.current) return;
    const { x, y } = toRegion(e.clientX, e.clientY, surfaceRef.current);
    setDrag({ ...drag, r: { x: Math.min(drag.x0, x), y: Math.min(drag.y0, y), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) } });
  };
  const onPointerUp = () => {
    if (!interactive || !drag) return;
    const r = drag.r;
    setDrag(null);
    if (r.w > 0.02 && r.h > 0.02) onDrawRegion(r);
  };
  const onKeyPlace = (e: React.KeyboardEvent) => {
    // Keyboard fallback: Enter on the (always-active) surface places a centered quarter box.
    if (!interactive) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onDrawRegion({ x: 0.375, y: 0.375, w: 0.25, h: 0.25 });
    }
  };

  // Item 6 — pointer drag to reposition the committed draft box (delta relative to the fitted image).
  const onMoveDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draftRegion) return;
    e.stopPropagation(); // don't start a new draw on the surface underneath
    e.preventDefault();
    setMoveDrag({ px: e.clientX, py: e.clientY, r: draftRegion });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / no active pointer — move still works via move/up */
    }
  };
  const onMoveMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!moveDrag || !surfaceRef.current) return;
    const b = surfaceRef.current.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const r = moveDrag.r;
    onDrawRegion({
      x: clampPos(r.x + (e.clientX - moveDrag.px) / b.width, r.w),
      y: clampPos(r.y + (e.clientY - moveDrag.py) / b.height, r.h),
      w: r.w,
      h: r.h,
    });
  };
  const onMoveUp = () => setMoveDrag(null);
  // Keyboard reposition (arrow keys nudge by MOVE_STEP), clamped to the image bounds.
  const onMoveKey = (e: React.KeyboardEvent) => {
    if (!draftRegion) return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-MOVE_STEP, 0],
      ArrowRight: [MOVE_STEP, 0],
      ArrowUp: [0, -MOVE_STEP],
      ArrowDown: [0, MOVE_STEP],
    };
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    const r = draftRegion;
    onDrawRegion({ x: clampPos(r.x + d[0], r.w), y: clampPos(r.y + d[1], r.h), w: r.w, h: r.h });
  };

  // The dashed preview while actively drawing a NEW box (non-interactive).
  const drawingPreview = drag?.r ?? null;
  // The committed, movable draft box (whenever we're not mid-drag of a fresh one).
  const movable = !drag && draftRegion ? draftRegion : null;

  // A2 (CS-25) — ONE box factory for BOTH panes: identical normalized coordinates, so the region lands
  // at the same place on the old and the new version. The new pane's copies are inert and aria-hidden —
  // a second announcement of the same correction would only be noise.
  const renderBoxes = (pane: 'old' | 'new') =>
    corrections.map((c) => {
      if (c.type !== 'dessin' || !('region' in c.anchor) || !c.anchor.region) return null;
      const r = c.anchor.region;
      const n = numberOf(c.id);
      const selected = selectedId === c.id;
      const highlight = selected || activeId === c.id;
      // CS-25 — walkthrough: everything but the correction under triage is dimmed.
      const dimmed = activeId != null && activeId !== c.id;
      const box: CSSProperties = {
        position: 'absolute',
        left: pct(r.x),
        top: pct(r.y),
        width: pct(r.w),
        height: pct(r.h),
        border: `3px solid ${statusColor(c.status)}`,
        background: 'transparent',
        boxShadow: highlight ? '0 0 0 2px var(--accent)' : 'none',
        opacity: dimmed ? 0.25 : 1,
        padding: 0,
      };
      const badge = (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -13,
            left: -13,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: statusColor(c.status),
            color: '#fff',
            border: '2px solid var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 13,
          }}
        >
          {n}
        </span>
      );
      if (pane === 'new') {
        return (
          <div key={c.id} data-correction-id={c.id} data-pane="new" aria-hidden="true" style={{ ...box, pointerEvents: 'none' }}>
            {badge}
          </div>
        );
      }
      return (
        <button
          key={c.id}
          type="button"
          data-correction-id={c.id}
          data-pane="old"
          onClick={() => onSelect(selected ? null : c.id)}
          aria-label={`Correction ${n} — ${CORRECTION_STATUS_LABELS[c.status]}`}
          aria-pressed={selected}
          style={{ ...box, cursor: 'pointer' }}
        >
          {badge}
        </button>
      );
    });

  return (
    <div>
      {/* A1 (iter 6) — no toggle button: the composer is always active. A persistent hint tells the
          reviewer how to place a zone (drag on the image, or Entrée for a centred box). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        {interactive && (
          <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
            Tracez un cadre sur l’image pour cibler la zone à corriger (ou Entrée pour un cadre centré).
          </span>
        )}
        {/* CS-25 (F4) — onion-skin: fades the new version OVER the old one, in place. Opacity only;
            both images stay untouched. Available outside the walkthrough too. */}
        {hasNewer && (
          <span className="ep-onion-skin" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}>
            <label htmlFor={fadeId} style={{ whiteSpace: 'nowrap' }}>{`Fondu v${fromVersion} → v${toVersion}`}</label>
            <input
              id={fadeId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={fade}
              onChange={(e) => setFade(Number(e.target.value))}
              // A native range announces a bare number; this says WHAT the number means, so arrowing
              // through it is intelligible without sight of the two panes.
              aria-valuetext={`${fade}\u00a0% — v${toVersion} par-dessus v${fromVersion}`}
              style={{ width: 140, minHeight: 44, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ minWidth: 44, color: 'var(--ink2)' }}>{`${fade}\u00a0%`}</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} className="ep-dessin-compare">
        {/* OLD image with region boxes + draw surface */}
        <div className="ep-dessin-frame" style={imgWrap}>
          <div style={{ padding: '6px 10px', borderBottom: '2px solid var(--ink)', fontSize: 11, fontWeight: 700, background: 'var(--paper)' }}>
            {`v${fromVersion} · révisée`}
          </div>
          <div
            ref={surfaceRef}
            data-dessin-surface=""
            // A1 — always an active drawing surface (no toggle): role/label/tabIndex/crosshair are on.
            // CS-25 — except while the walkthrough owns the surface: no role, no handlers, no crosshair,
            // so a stray drag mid-triage can't file a phantom region.
            {...(interactive
              ? ({ role: 'application', 'aria-label': 'Tracer une zone de correction', tabIndex: 0 } as const)
              : {})}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyPlace}
            // inline-block: the surface shrink-wraps the fitted image so its box === the rendered image
            // (region coords stay exact); relative positions the boxes; no transform on box start (feedback C).
            style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', cursor: interactive ? 'crosshair' : 'default', touchAction: 'none' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fromImageUrl} alt={`Planche révisée (v${fromVersion})`} style={fittedImg} />
            {/* CS-25 — the onion-skin layer: the SAME new-version image, opacity-faded over the old one.
                Decorative (alt=""), never interactive, no canvas, no blend mode, no derivative. */}
            {hasNewer && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                data-onion-skin=""
                src={toImageUrl!}
                alt=""
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: fade / 100, pointerEvents: 'none' }}
              />
            )}
            {renderBoxes('old')}
            {drawingPreview && (drawingPreview.w > 0 || drawingPreview.h > 0) && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: pct(drawingPreview.x),
                  top: pct(drawingPreview.y),
                  width: pct(drawingPreview.w),
                  height: pct(drawingPreview.h),
                  border: '2px dashed var(--accent)',
                  background: 'rgba(232,38,28,.10)',
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Item 6 — the committed draft box: draggable (pointer) + keyboard-movable (arrow keys). */}
            {movable && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Déplacer la zone de correction (flèches du clavier)"
                onPointerDown={onMoveDown}
                onPointerMove={onMoveMove}
                onPointerUp={onMoveUp}
                onKeyDown={onMoveKey}
                style={{
                  position: 'absolute',
                  left: pct(movable.x),
                  top: pct(movable.y),
                  width: pct(movable.w),
                  height: pct(movable.h),
                  border: '2px dashed var(--accent)',
                  background: 'rgba(232,38,28,.12)',
                  cursor: moveDrag ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
              />
            )}
          </div>
        </div>

        {/* NEW image (compare) when a newer version exists */}
        {hasNewer && (
          <>
            <div style={{ flex: 'none', width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cabfb2', fontSize: 18 }} aria-hidden="true">
              →
            </div>
            <div className="ep-dessin-frame" style={imgWrap}>
              <div style={{ padding: '6px 10px', borderBottom: '2px solid var(--ink)', fontSize: 11, fontWeight: 700, background: 'var(--paper)' }}>
                {`v${toVersion} · nouvelle`}
              </div>
              {/* A2 (CS-25) — the same normalized regions drawn over the NEW version, read-only. */}
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toImageUrl!} alt={`Nouvelle planche (v${toVersion})`} style={fittedImg} />
                {renderBoxes('new')}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
