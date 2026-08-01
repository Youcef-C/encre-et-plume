'use client';

// Shared on-brand toggle switch — a real `role="switch"` button, not a checkbox: it flips a setting
// that takes effect immediately, which is what a switch means and what a checkbox does not.
//
// One definition for the whole app: the arrangement screen's « Couverture » toggle and the settings
// page's notification switches draw THIS. (GroupMembersCard's permission cells are deliberately not
// this control — they are the prototype's permission pills, a different thing that happens to use
// `role="switch"` too.)
//
// ON is the ACCENT RED, not ink (user, 2026-08-01) — a switch is a live setting, so it reads as an
// active state, not as neutral chrome. The track is deliberately compact: the ≥44px pointer target
// is an ::after overlay (`.ep-switch`), so a row holding a switch is not forced to be 44px tall.
// Those two were deliberately NOT migrated in this change — a follow-up, not CS-6's diff.
//
// `label` and the optional `description` sit beside the track, the description UNDER the label.

export interface OnBrandSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Rendered under the label, in the muted meta style. */
  description?: string;
  disabled?: boolean;
  id?: string;
  /** Render the track alone — for grids that already head their columns (the settings page). The
   *  `label` still names the switch for assistive tech; it just isn't drawn beside it. */
  hideLabel?: boolean;
}

export default function OnBrandSwitch({ checked, onChange, label, description, disabled, id, hideLabel }: OnBrandSwitchProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // `.ep-switch` grows the TAP TARGET to ≥44px with an ::after overlay instead of min-height.
        // Reserving 44px of layout made every row that holds a switch tall and airy; the pointer
        // target is a hit area, and a hit area does not have to occupy space.
        className="ep-switch"
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          border: '2px solid var(--border)',
          background: checked ? 'var(--accent)' : 'var(--tone)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          position: 'relative',
          transition: 'background 0.15s',
          flexShrink: 0,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: checked ? 'var(--card)' : 'var(--ink2)',
            left: checked ? 'calc(100% - 16px)' : '2px',
            transition: 'left 0.15s',
          }}
        />
      </button>
      {/* aria-hidden: the switch already carries `label` as its accessible name, so exposing this
          text again would make a screen reader announce it twice. */}
      {!hideLabel && (
        <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
          {description && <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 500 }}>{description}</span>}
        </span>
      )}
    </div>
  );
}
