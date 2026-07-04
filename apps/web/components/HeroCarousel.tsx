'use client';

// DR-1 — "À LA UNE" hero carousel. Replica of prototype ACCUEIL lines 389-407.
// DR-9 FE4: "＋ Ma liste" is re-pointed from the nav-only stub to the real per-slide save toggle.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { FeaturedWork, ReactionStateResponse } from '@encre-et-plume/shared';
import { useSession } from '../lib/session';
import { useAgeCleared } from '../lib/ageGate';
import { useReaction } from '../lib/useReaction';
import * as api from '../lib/api';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import Cover18Overlay from './age/Cover18Overlay';

const AUTO_ADVANCE_MS = 6000;

function coverStyle(cover: string | null): React.CSSProperties {
  if (cover) return { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  // Halftone placeholder — same pattern as the rest of the design system.
  return {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.6px,transparent 1.7px), linear-gradient(125deg, var(--ink) 42%, var(--accent) 42%)',
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}

export default function HeroCarousel({ slides }: { slides: FeaturedWork[] }) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const { account } = useSession();
  const cleared = useAgeCleared(account);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const count = slides.length;
  const next = () => setActive((i) => (i + 1) % count);
  const prev = () => setActive((i) => (i - 1 + count) % count);

  useEffect(() => {
    if (count <= 1) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || hovered) return;
    timerRef.current = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, hovered, active]);

  // DR-9: hydrate every slide's saved state in one GET /reactions/state call.
  const [reactionState, setReactionState] = useState<ReactionStateResponse>({});
  useEffect(() => {
    if (!account || count === 0) {
      setReactionState({});
      return;
    }
    let cancelled = false;
    api
      .getReactionState('work', slides.map((s) => s.slug))
      .then((state) => {
        if (!cancelled) setReactionState(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, count]);

  // Hook order must stay stable across renders — compute `slide` before the early return and
  // fall back to an empty targetId when the carousel has no slides yet.
  const slide = slides[active];
  const save = useReaction({
    targetType: 'work',
    targetId: slide?.slug ?? '',
    kind: 'save',
    account,
    initialActive: slide ? (reactionState[slide.slug]?.saved ?? false) : false,
    initialCount: 0,
  });
  if (count === 0 || !slide) return null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        height: 'clamp(300px, 40vw, 400px)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '9px 9px 0 var(--accent)',
        background: '#16130f',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, ...coverStyle(slide.cover) }} />
      <Cover18Overlay is18plus={slide.is18plus} cleared={cleared} label="Œuvre 18+" />
      <span
        style={{
          position: 'absolute',
          top: 22,
          left: 24,
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          letterSpacing: '.16em',
          background: 'var(--card)',
          color: 'var(--ink)',
          padding: '6px 15px',
          border: '3px solid var(--ink)',
          transform: 'rotate(-2deg)',
        }}
      >
        À LA UNE
      </span>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Diapositive précédente"
            style={arrowStyle('left')}
          >
            <ChevronLeftIcon size={20} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Diapositive suivante"
            style={arrowStyle('right')}
          >
            <ChevronRightIcon size={20} />
          </button>
          <div style={{ position: 'absolute', top: 26, right: 24, display: 'flex', gap: 7, zIndex: 3 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Aller à la diapositive ${i + 1}`}
                aria-current={i === active}
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  border: '2px solid var(--ink)',
                  background: i === active ? 'var(--accent)' : 'var(--card)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </>
      )}

      <div
        style={{
          position: 'absolute',
          left: 24,
          bottom: 24,
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 10,
          padding: '20px 24px',
          maxWidth: 540,
          boxShadow: '6px 6px 0 var(--shadow)',
        }}
      >
        <div
          data-testid="hero-slide-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(30px, 5vw, 52px)',
            lineHeight: 0.92,
            textTransform: 'uppercase',
          }}
        >
          {slide.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '9px 0 16px', fontWeight: 500 }}>
          {slide.meta}
        </div>
        <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap' }}>
          <Link href={`/oeuvre/${slide.slug}`} className="ep-btn-primary">
            Lire maintenant
          </Link>
          <button
            type="button"
            onClick={save.toggle}
            className="ep-btn-secondary"
            aria-pressed={save.active}
            aria-label={save.active ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
            title={save.active ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
          >
            ＋ Ma liste
          </button>
        </div>
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {slide.title}
      </div>
    </div>
  );
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 18,
    transform: 'translateY(-50%)',
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '3px solid var(--ink)',
    background: 'var(--card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '3px 3px 0 var(--shadow)',
    zIndex: 3,
    padding: 0,
  };
}
