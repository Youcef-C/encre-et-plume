'use client';

// MC-15 — the like heart, on the LEFT of the bubble. Double-clicking the bubble likes it too, but
// D-2 says double-click is never the ONLY way: this heart is a real, focusable toggle.
//
// It is always in the DOM (the CSS reveals it on hover/focus while nobody has liked yet, and paints
// it outright once there is a like) — otherwise there would be no control to click before the first
// like, and double-click would be the only path after all.
//
// R2-B: the count beside it is a SECOND, separate control that opens « qui a aimé » — the heart only
// ever toggles, the count only ever opens the list (R2-B3). D-8 supersedes D-5 for that reason: the
// count is now the affordance, so it shows from the first like instead of only above one.
import { HeartIcon } from '../icons';
import MessageLikers from './MessageLikers';

export default function MessageLikeToggle({
  messageId,
  liked,
  count,
  authorName,
  onToggle,
}: {
  /** Needed by the likers list, which fetches on demand rather than reading the message DTO. */
  messageId: string;
  liked: boolean;
  count: number;
  authorName: string;
  onToggle: (next: boolean) => void;
}) {
  const state = liked ? 'Je n’aime plus le message' : 'J’aime le message';
  const label =
    count > 0
      ? `${state} de ${authorName}, ${count} j’aime`
      : `${state} de ${authorName}`;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flex: 'none' }}>
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
          minWidth: 30,
          minHeight: 44,
          padding: 0,
          border: 'none',
          background: 'none',
          color: liked ? 'var(--accent)' : 'var(--ink2)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          flex: 'none',
        }}
      >
        <HeartIcon size={14} filled={liked} />
      </button>
      {/* Only ever rendered once somebody liked — so it needs no hover reveal of its own. */}
      {count > 0 && <MessageLikers messageId={messageId} count={count} authorName={authorName} />}
    </span>
  );
}
