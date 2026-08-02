'use client';

// MC-15 — the bubble becomes editable IN PLACE. Shared by the widget and the project Discussion; the
// salon never mounts it (its server refuses PATCH on a salon message, 403).
//
// A failed edit restores the previous body and shows the server's own French message (F6): the user
// never loses what they typed to a silent failure, and never sees an English transport error.
import { useEffect, useRef, useState } from 'react';
import { MESSAGE_MAX_LENGTH } from '@encre-et-plume/shared';

export default function MessageEditor({
  initialValue,
  hasAttachment = false,
  onSave,
  onCancel,
}: {
  initialValue: string;
  /** Same rule as a send: an empty body is fine ONLY when the message still carries an attachment. */
  hasAttachment?: boolean;
  onSave: (text: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(initialValue.length, initialValue.length);
  }, [initialValue]);

  const canSave = (value.trim().length > 0 || hasAttachment) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
    } catch (e) {
      const raw = (e as { message?: string } | null)?.message;
      // Only French server copy reaches the alert; a transport TypeError ("Failed to fetch") never does.
      setError(raw && /^[^A-Za-z]*[A-ZÀ-Ü]/.test(raw) ? raw : 'La modification a échoué.');
      setValue(initialValue); // the previous body comes back — the edit is abandoned, not half-applied
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <textarea
        ref={ref}
        value={value}
        aria-label="Modifier le message"
        maxLength={MESSAGE_MAX_LENGTH}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          // Enter saves, Shift+Enter keeps a line break — the composer idiom of every surface.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        style={{
          fontSize: 14,
          lineHeight: 1.45,
          color: 'var(--ink)',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          borderRadius: 8,
          padding: '8px 11px',
          fontFamily: 'inherit',
          outline: 'none',
          resize: 'vertical',
          minWidth: 0,
        }}
      />
      {error && (
        <span role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
          {error}
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="ep-btn-primary"
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '6px 13px',
            minHeight: 44,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.55,
            fontFamily: 'inherit',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ep-btn-secondary"
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '6px 13px',
            minHeight: 44,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
