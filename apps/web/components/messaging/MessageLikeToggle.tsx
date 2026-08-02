'use client';

// MC-15 — the like heart, on the LEFT of the bubble. Double-clicking the bubble likes it too, but
// D-2 says double-click is never the ONLY way: this heart is a real, focusable toggle.
//
// It is always in the DOM (the CSS reveals it on hover/focus while nobody has liked yet, and paints
// it outright once there is a like) — otherwise there would be no control to click before the first
// like, and double-click would be the only path after all.
import { HeartIcon } from '../icons';

export default function MessageLikeToggle({
  liked,
  count,
  authorName,
  onToggle,
}: {
  liked: boolean;
  count: number;
  authorName: string;
  onToggle: (next: boolean) => void;
}) {
  // D-5: a "1" beside every heart is noise — a single like IS the filled heart.
  const showCount = count > 1;
  const state = liked ? 'Je n’aime plus le message' : 'J’aime le message';
  const label =
    count > 0
      ? `${state} de ${authorName}, ${count} j’aime`
      : `${state} de ${authorName}`;

  return (
    <button
      type="button"
      // A switch-style toggle: the state is announced, never inferred from the fill colour.
      aria-pressed={liked}
      aria-label={label}
      onClick={() => onToggle(!liked)}
      className={liked || count > 0 ? 'ep-like-toggle ep-like-toggle--on' : 'ep-like-toggle'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: 34,
        minHeight: 44,
        padding: 0,
        border: 'none',
        background: 'none',
        color: liked ? 'var(--accent)' : 'var(--ink2)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11,
        fontWeight: 700,
        flex: 'none',
      }}
    >
      <HeartIcon size={14} filled={liked} />
      {showCount && <span aria-hidden="true">{count}</span>}
    </button>
  );
}
