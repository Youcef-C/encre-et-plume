'use client';

// DR-4 FE-5 — page navigation: prev/next + slider. Replica of LECTEUR lines 817-824.
// Owns the ArrowLeft/ArrowRight keyboard-paging listener (F11) so it stays testable in isolation;
// guarded against stealing keys from a focused text input (e.g. the Réactions comment composer).
import { useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';

type Props = {
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

export default function ReaderNav({ page, totalPages, step, onPrev, onNext, onSetPage }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onPrev, onNext]);

  return (
    <div
      className="ep-reader-navbtn"
      style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, color: '#f1ece1', width: '100%', maxWidth: 560 }}
    >
      <button
        type="button"
        aria-label="Page précédente"
        onClick={onPrev}
        disabled={page <= 1}
        style={{ ...circleBtn, background: 'var(--card)', color: 'var(--ink)', opacity: page <= 1 ? 0.4 : 1 }}
      >
        <ChevronLeftIcon size={15} />
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          type="range"
          min={1}
          max={totalPages}
          value={page}
          aria-label="Page"
          aria-valuetext={`page ${page} sur ${totalPages}`}
          onChange={(e) => onSetPage(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#cabfb2' }}>
          <span>1</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#fff', letterSpacing: '.05em' }}>
            {page} / {totalPages}
          </span>
          <span>{totalPages}</span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Page suivante"
        onClick={onNext}
        disabled={page + step > totalPages}
        style={{ ...circleBtn, background: 'var(--accent)', color: '#fff', opacity: page + step > totalPages ? 0.4 : 1 }}
      >
        <ChevronRightIcon size={15} />
      </button>
    </div>
  );
}
