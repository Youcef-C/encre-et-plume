'use client';

// MC-15 — the ONE discreet entry point a message bubble carries. Built once here and consumed by the
// MC-9 widget, the MC-11 salon dock and the CS-8 project Discussion; a per-surface copy is exactly
// the drift this story exists to remove.
//
// It renders only the items it is GIVEN: the salon simply passes canEdit={false} canDelete={false}
// (its server refuses both, 403), so no surface rule is special-cased inside this component.
import OverflowMenu, { MenuItem } from '../OverflowMenu';

export default function MessageActions({
  authorName,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  placement = 'below',
}: {
  /** Names the bubble the menu acts on, so the trigger is not one of a dozen anonymous "…". */
  authorName: string;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Toward the middle of the thread: an outgoing bubble opens left, an incoming one right (CS-8 N-6). */
  placement?: 'below' | 'left' | 'right';
}) {
  return (
    // D-1: always in the DOM. CSS fades it in on hover AND on focus-within, and paints it outright
    // where hover does not exist (touch) — hover-only would lock out the keyboard and every phone.
    <span className="ep-bubble-actions" style={{ flex: 'none' }}>
      <OverflowMenu
        label={`Actions du message de ${authorName}`}
        placement={placement}
        width={150}
        triggerStyle={{
          border: 'none',
          background: 'none',
          color: 'var(--ink2)',
          minWidth: 34,
          minHeight: 44,
          padding: 0,
          fontSize: 18,
        }}
      >
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                onReply();
              }}
            >
              Répondre
            </MenuItem>
            {canEdit && onEdit && (
              <MenuItem
                onClick={() => {
                  close();
                  onEdit();
                }}
              >
                Modifier
              </MenuItem>
            )}
            {canDelete && onDelete && (
              <MenuItem
                accent
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                Supprimer
              </MenuItem>
            )}
          </>
        )}
      </OverflowMenu>
    </span>
  );
}
