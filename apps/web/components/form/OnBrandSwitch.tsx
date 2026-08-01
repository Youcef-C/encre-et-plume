'use client';

// Shared on-brand toggle switch — a real `role="switch"` button, not a checkbox: it flips a setting
// that takes effect immediately, which is what a switch means and what a checkbox does not.
//
// The markup is the one PreferencesNotifications and GroupMembersCard already draw inline (ink track,
// pale knob, 44px tap target); extracted here on the third use so the design system has ONE switch.
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
}

export default function OnBrandSwitch({ checked, onChange, label, description, disabled, id }: OnBrandSwitchProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          border: '2px solid var(--border)',
          background: checked ? 'var(--ink)' : 'var(--tone)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          position: 'relative',
          transition: 'background 0.15s',
          flexShrink: 0,
          padding: 0,
          // ≥44px tap target on touch, without growing the visible track.
          minWidth: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: checked ? 'var(--card)' : 'var(--ink2)',
            left: checked ? 'calc(100% - 20px)' : '2px',
            transition: 'left 0.15s',
          }}
        />
      </button>
      {/* aria-hidden: the switch already carries `label` as its accessible name, so exposing this
          text again would make a screen reader announce it twice. */}
      <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.25 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        {description && <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{description}</span>}
      </span>
    </div>
  );
}
