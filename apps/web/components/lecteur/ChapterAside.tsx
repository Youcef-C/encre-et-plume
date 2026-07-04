'use client';

// DR-4 FE-3 — left "Chapitres" aside with lock state. Replica of LECTEUR lines 767-778.
import type { WorkChapterDto } from '@encre-et-plume/shared';
import { CollapseLeftIcon, CollapseRightIcon } from '../icons';

type Props = {
  chapters: WorkChapterDto[];
  currentChapterNumber: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onLoadChapter: (chapter: WorkChapterDto) => void;
  onOpenPaywall: (chapter: WorkChapterDto) => void;
};

const asideStyle: React.CSSProperties = {
  width: 184,
  flex: 'none',
  background: '#221d18',
  border: '3px solid #4a4239',
  borderRadius: 8,
  padding: 13,
  color: '#cabfb2',
};

// Extracted so the "Plein écran" immersive bottom bar's compact chapter-switch popover
// (ImmersiveBar) can reuse the exact same rows/lock semantics without duplicating them.
export function ChapterRows({
  chapters,
  currentChapterNumber,
  onLoadChapter,
  onOpenPaywall,
}: Pick<Props, 'chapters' | 'currentChapterNumber' | 'onLoadChapter' | 'onOpenPaywall'>) {
  function handleClick(chapter: WorkChapterDto) {
    if (chapter.locked) onOpenPaywall(chapter);
    else onLoadChapter(chapter);
  }

  return (
    <>
      {chapters.map((chapter) => {
        const active = chapter.number === currentChapterNumber;
        const label = chapter.locked ? `${chapter.number} · — verrouillé ★` : `${chapter.number} · ${chapter.title ?? '—'}`;
        return (
          <button
            key={chapter.id}
            type="button"
            onClick={() => handleClick(chapter)}
            aria-current={active ? 'true' : undefined}
            style={{
              textAlign: 'left',
              padding: '6px 8px',
              borderRadius: 5,
              minHeight: 32,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : '#cabfb2',
              opacity: chapter.locked ? 0.5 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </>
  );
}

export default function ChapterAside({
  chapters,
  currentChapterNumber,
  collapsed,
  onToggleCollapsed,
  onLoadChapter,
  onOpenPaywall,
}: Props) {
  if (collapsed) {
    return (
      <aside style={{ ...asideStyle, width: 48 }}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Développer"
          title="Développer"
          style={{
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            background: 'none',
            border: 'none',
            color: '#cabfb2',
            fontFamily: 'inherit',
          }}
        >
          <CollapseRightIcon size={16} style={{ color: '#fff' }} />
          <span style={{ writingMode: 'vertical-rl', fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Chapitres
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside data-side="left" style={asideStyle}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', color: '#fff' }}>Chapitres</div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Réduire"
          title="Réduire"
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            width: 28,
            height: 28,
            border: '2px solid #4a4239',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#cabfb2',
            background: 'none',
          }}
        >
          <CollapseLeftIcon size={14} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 500 }}>
        <ChapterRows chapters={chapters} currentChapterNumber={currentChapterNumber} onLoadChapter={onLoadChapter} onOpenPaywall={onOpenPaywall} />
      </div>
    </aside>
  );
}
