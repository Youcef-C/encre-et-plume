'use client';

// The app's transient message toast: fixed bottom-centre, ink fill, hard offset shadow — the exact
// markup CS-4's editor and CS-5's révision screen already draw inline, extracted here so a third
// screen (CS-6 « Réorganiser les pages ») reuses it instead of copying it a third time.
//
// The dismiss timer stays with the CALLER: some messages are transient ("Ordre enregistré", 3 s) and
// some must hold until the operation ends ("Enregistrement…"). `role="status"` + `aria-live="polite"`
// means the text is announced, so a confirmation is never colour- or position-only.
//
// (CS-4's EditorClient stacks several at once and CS-5's ReviewClient shows one; neither was migrated
// here — that is a follow-up refactor, deliberately out of CS-6's diff.)

export interface ToastProps {
  /** The message to show; `null` renders nothing. */
  message: string | null;
  /**
   * DR-14: an optional inline action ("Réessayer maintenant"). Colour comes from the shared
   * `.ep-btn-compact--ghost` intent class — never inline; only layout (tap target) is inline.
   */
  action?: { label: string; onClick: () => void };
}

export default function Toast({ message, action }: ToastProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        background: 'var(--ink)',
        color: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: 700,
        textAlign: 'center',
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: '4px 4px 0 var(--shadow)',
        // Only when there IS an action — a message-only toast renders exactly as before.
        ...(action
          ? { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const }
          : null),
      }}
    >
      {message}
      {action ? (
        <button
          type="button"
          className="ep-btn-compact ep-btn-compact--ghost"
          onClick={action.onClick}
          style={{ minHeight: 44, minWidth: 44 }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
