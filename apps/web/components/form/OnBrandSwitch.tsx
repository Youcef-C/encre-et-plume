'use client';

// Shared on-brand toggle switch — a real `role="switch"` button, not a checkbox: it flips a setting
// that takes effect immediately, which is what a switch means and what a checkbox does not.
//
// THE switch for the whole app (user, 2026-08-01): the arrangement screen's « Couverture » toggle,
// the settings page's notification matrix and the « Gérer le groupe » permission cells all draw this
// one control.
//
// The look is the PROTOTYPE's permission pill (GROUPE & PERMISSIONS, .dc.html 2280–2292) — a 34×20
// track, bold `2px solid var(--ink)` border, ACCENT RED when on with a white knob to the right,
// paper when off with an ink knob to the left. That pill is the only switch the prototype actually
// draws, so it is the on-brand one; the settings page's muted grey-track version was the odd one out.
//
// STRUCTURE — the button is the HIT BOX, the inner span is the PILL. They are separated on purpose:
// the pill is uniform everywhere, while the tap target is per-instance layout (the CLAUDE.md rule).
// By default the button is compact and `.ep-switch::after` overlays a ≥44px target without reserving
// layout height, which is what used to make every row holding a switch tall and airy. A caller in a
// dense GRID must opt out of that overlay and reserve a real box instead (`.ep-perm-switch`): five
// permission columns at 375px would otherwise have invisible hit areas overlapping their neighbours,
// so a tap on « Lecture » could toggle « Écriture ».
//
// `label` and the optional `description` sit beside the pill, the description UNDER the label.

export interface OnBrandSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Rendered under the label, in the muted meta style. */
  description?: string;
  disabled?: boolean;
  id?: string;
  /** Render the pill alone — for grids that already head their columns (the settings matrix, the
   *  permissions table). The `label` still names the switch for assistive tech. */
  hideLabel?: boolean;
  /** Extra class on the button, for callers that size their own hit box. */
  className?: string;
}

export default function OnBrandSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  hideLabel,
  className,
}: OnBrandSwitchProps) {
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
        className={className ? `ep-switch ${className}` : 'ep-switch'}
      >
        {/* The pill — identical on every screen. */}
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 34,
            height: 20,
            borderRadius: 999,
            border: '2px solid var(--ink)',
            background: checked ? 'var(--accent)' : 'var(--card)',
            position: 'relative',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 1,
              width: 14,
              height: 14,
              borderRadius: '50%',
              // White (not --card) on purpose: the knob sits on the accent red when on and must stay
              // light in either theme. This is the prototype's own value.
              background: checked ? '#fff' : 'var(--ink)',
              left: checked ? 'calc(100% - 17px)' : '1px',
              transition: 'left 0.15s, background 0.15s',
            }}
          />
        </span>
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
