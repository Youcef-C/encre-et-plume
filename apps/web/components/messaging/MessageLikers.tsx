'use client';

// MC-15 R2-B — « voir qui a aimé ». The count beside the heart is a SECOND control that opens a small
// anchored list of the likers.
//
// The interaction trap this solves: the heart is already a toggle (D-2), and a control that both
// toggles AND opens a list on the same gesture is a trap. So the two are separate buttons —
// heart = toggle, count = list — and neither ever does the other's job (R2-B3).
//
// Positioning is `useAnchoredPopover`, the same seam OverflowMenu uses: a floating layer must escape
// the message log's scroll and the dock's `overflow:hidden`, so no fourth popover is hand-rolled here.
import { useCallback, useEffect, useState } from 'react';
import type { MessageLikerDto } from '@encre-et-plume/shared';
import { getMessageLikes } from '../../lib/api';
import { anchoredPanelStyle, useAnchoredPopover } from '../useAnchoredPopover';

const WIDTH = 220;
type State = 'loading' | 'ready' | 'error';

function avatarDisc(url: string | null): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    display: 'block',
    background: url
      ? `center/cover url(${url})`
      : 'radial-gradient(var(--ink) 1.4px, transparent 1.5px) 0 0/7px 7px, var(--tone)',
  };
}

export default function MessageLikers({
  messageId,
  count,
  authorName,
}: {
  messageId: string;
  /** Shown as the button's label. D-8: visible from the FIRST like — it is the affordance. */
  count: number;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('loading');
  const [items, setItems] = useState<MessageLikerDto[]>([]);

  const { rootRef, triggerRef, panelRef, pos } = useAnchoredPopover(
    open,
    (restoreFocus) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    { width: WIDTH, placement: 'below' },
  );

  // Fetched ON DEMAND — the message DTO carries only likeCount/likedByMe, never the people.
  const load = useCallback(() => {
    setState('loading');
    getMessageLikes(messageId)
      .then((page) => {
        setItems(page.items);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [messageId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // The panel takes focus so a keyboard user lands ON the list; Escape hands focus back (above).
  useEffect(() => {
    if (open && state !== 'loading') panelRef.current?.focus();
  }, [open, state, panelRef]);

  return (
    <span ref={rootRef as React.RefObject<HTMLSpanElement>} style={{ position: 'relative', flex: 'none' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Voir qui aime le message de ${authorName}, ${count} j’aime`}
        onClick={() => setOpen((o) => !o)}
        className="ep-like-count"
        style={{
          minWidth: 22,
          minHeight: 44,
          padding: 0,
          border: 'none',
          background: 'none',
          color: 'var(--ink2)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {count}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Aimé par"
          tabIndex={-1}
          style={{ ...anchoredPanelStyle(pos, WIDTH), maxHeight: 220, overflowY: 'auto' }}
        >
          <p
            style={{
              margin: 0,
              padding: '8px 11px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--ink2)',
              borderBottom: '2px solid var(--border)',
            }}
          >
            Aimé par
          </p>

          {state === 'loading' && (
            <p style={{ margin: 0, padding: '10px 11px', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</p>
          )}

          {state === 'error' && (
            <div style={{ padding: '10px 11px' }}>
              <p role="alert" style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                Impossible de charger la liste.
              </p>
              <button
                type="button"
                onClick={load}
                className="ep-btn-secondary"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 12px',
                  minHeight: 40,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Réessayer
              </button>
            </div>
          )}

          {state === 'ready' &&
            (items.length === 0 ? (
              <p style={{ margin: 0, padding: '10px 11px', fontSize: 13, color: 'var(--ink2)' }}>
                Personne pour le moment.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((u) => (
                  <li
                    key={u.accountId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '7px 11px',
                      borderBottom: '2px solid var(--border)',
                      minHeight: 44,
                    }}
                  >
                    <span aria-hidden="true" style={avatarDisc(u.avatar)} />
                    <span
                      style={{
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.displayName}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </span>
  );
}
