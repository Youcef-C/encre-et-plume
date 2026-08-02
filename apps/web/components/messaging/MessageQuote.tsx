'use client';

// MC-15 — the quote a reply renders above its own body, and the banner the composer shows while you
// are answering someone. One component, two variants, three surfaces.
//
// The excerpt arrives already truncated from the server (MESSAGE_EXCERPT_MAX) — nothing is re-derived
// here. `deleted` is D-3: the quoted message is gone, so the quote reads « Message supprimé » instead
// of the reply silently losing its context.
import type { MessageReplyRef } from '@encre-et-plume/shared';
import { XIcon } from '../icons';

const RAIL = '3px solid var(--accent)';

export default function MessageQuote({
  reply,
  onJump,
  onCancel,
  variant = 'bubble',
}: {
  reply: MessageReplyRef;
  /** Scroll to (and flash) the original. Omitted ⇒ the quote is not interactive. */
  onJump?: () => void;
  /** Composer variant only: drop the reply target. */
  onCancel?: () => void;
  variant?: 'bubble' | 'composer';
}) {
  const composer = variant === 'composer';

  const frame: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    borderLeft: RAIL,
    background: 'var(--paper)',
    borderRadius: '4px 8px 8px 4px',
    padding: '5px 9px',
    marginBottom: composer ? 0 : 5,
    fontFamily: 'inherit',
    minWidth: 0,
    overflow: 'hidden',
  };

  const body = reply.deleted ? (
    // Never colour-only: the state is the word itself.
    <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--ink2)' }}>Message supprimé</span>
  ) : (
    <>
      <b style={{ display: 'block', fontSize: 11, color: 'var(--accent)' }}>{reply.senderName}</b>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          color: 'var(--ink2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {reply.excerpt}
      </span>
    </>
  );

  if (composer) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minWidth: 0,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ ...frame, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
            Réponse à {reply.deleted ? 'un message supprimé' : reply.senderName}
          </span>
          {!reply.deleted && (
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--ink2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {reply.excerpt}
            </span>
          )}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Annuler la réponse"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              border: 'none',
              background: 'none',
              color: 'var(--ink2)',
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            <XIcon size={14} />
          </button>
        )}
      </div>
    );
  }

  // A deleted target has nothing to jump to (its id is ''), so it is never a control.
  if (onJump && !reply.deleted) {
    return (
      <button
        type="button"
        onClick={onJump}
        aria-label={`Aller au message de ${reply.senderName}`}
        style={{ ...frame, border: 'none', borderLeft: RAIL, cursor: 'pointer', minHeight: 44 }}
      >
        {body}
      </button>
    );
  }
  return <div style={frame}>{body}</div>;
}
