'use client';

// DR-4 FE-5 — page navigation: prev/next + slider. Replica of LECTEUR lines 817-824.
// Owns the ArrowLeft/ArrowRight keyboard-paging listener (F11) so it stays testable in isolation;
// guarded against stealing keys from a focused text input (e.g. the Réactions comment composer).
import { useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import type { ReadingDirection } from './readingDirection';

type Props = {
  direction: ReadingDirection;
  page: number;
  totalPages: number;
  step: number; // 1 in single-page mode, 2 in 2-pages spread mode
  onPrev: () => void;
  onNext: () => void;
  onSetPage: (page: number) => void;
};

const circleBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  flex: 'none',
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function ReaderNav({ direction, page, totalPages, step, onPrev, onNext, onSetPage }: Props) {
  const rtl = direction === 'rtl';
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // RTL inverts the arrow mapping so it matches how manga is read: → = page précédente,
      // ← = page suivante. `page` stays the logical reading-order number; only the input maps.
      if (e.key === 'ArrowLeft') (rtl ? onNext : onPrev)();
      else if (e.key === 'ArrowRight') (rtl ? onPrev : onNext)();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onPrev, onNext, rtl]);

  const prevDisabled = page <= 1;
  const nextDisabled = page + step > totalPages;
  const cardBtn = (disabled: boolean): React.CSSProperties => ({ ...circleBtn, background: 'var(--card)', color: 'var(--ink)', opacity: disabled ? 0.4 : 1 });
  const accentBtn = (disabled: boolean): React.CSSProperties => ({ ...circleBtn, background: 'var(--accent)', color: '#fff', opacity: disabled ? 0.4 : 1 });

  // Buttons stay POSITIONAL (left keeps ‹, right keeps ›) so the glyph always points the way the
  // tap moves; in RTL the handler/label/disabled/style each position carries is swapped instead.
  const left = rtl
    ? { onClick: onNext, label: 'Page suivante', disabled: nextDisabled, style: accentBtn(nextDisabled) }
    : { onClick: onPrev, label: 'Page précédente', disabled: prevDisabled, style: cardBtn(prevDisabled) };
  const right = rtl
    ? { onClick: onPrev, label: 'Page précédente', disabled: prevDisabled, style: cardBtn(prevDisabled) }
    : { onClick: onNext, label: 'Page suivante', disabled: nextDisabled, style: accentBtn(nextDisabled) };

  return (
    <div
      className="ep-reader-navbtn"
      style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, color: '#f1ece1', width: '100%', maxWidth: 560 }}
    >
      <button type="button" aria-label={left.label} onClick={left.onClick} disabled={left.disabled} style={left.style}>
        <ChevronLeftIcon size={15} />
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Native `dir` gives the RTL fill AND inverted arrow semantics while the slider is focused,
            with zero custom code. `aria-valuetext` stays reading-order "page N sur M" (AC10). */}
        <input
          type="range"
          dir={direction}
          min={1}
          max={totalPages}
          value={page}
          aria-label="Page"
          aria-valuetext={`page ${page} sur ${totalPages}`}
          onChange={(e) => onSetPage(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#cabfb2' }}>
          <span>{rtl ? totalPages : 1}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#fff', letterSpacing: '.05em' }}>
            {page} / {totalPages}
          </span>
          <span>{rtl ? 1 : totalPages}</span>
        </div>
      </div>
      <button type="button" aria-label={right.label} onClick={right.onClick} disabled={right.disabled} style={right.style}>
        <ChevronRightIcon size={15} />
      </button>
    </div>
  );
}
