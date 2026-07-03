'use client';

// Shared on-brand checkbox — extracted from the profile edit form's "Recherche
// active" toggle (see F-20 frontend-notes "Profile edit ergonomics pass").
// A real (visually hidden) <input type="checkbox"> stays in the DOM for a11y
// (focusable, keyboard-toggleable, native label semantics); a custom ink-bordered
// box right after it fills accent-red and shows a CheckIcon when checked. The
// `.ep-checkbox-input:focus-visible + .ep-checkbox-box` rule in globals.css gives
// the box the platform's standard focus ring.
import type { InputHTMLAttributes, ReactNode } from 'react';
import { CheckIcon } from '../icons';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** When provided, the whole control (input + box + label) is wrapped in a
   * <label> for native click-to-toggle. Omit it to pair with your own
   * <label htmlFor={id}> alongside (see CookieBanner). */
  label?: ReactNode;
  size?: number;
};

export default function OnBrandCheckbox({
  label,
  size = 20,
  className,
  checked,
  disabled,
  style,
  ...rest
}: Props) {
  const input = (
    <input
      type="checkbox"
      className={['ep-checkbox-input', className].filter(Boolean).join(' ')}
      checked={checked}
      disabled={disabled}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      {...rest}
    />
  );

  const box = (
    <span
      className="ep-checkbox-box"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        border: '2px solid var(--ink)',
        borderRadius: 5,
        background: disabled ? 'var(--tone)' : checked ? 'var(--accent)' : 'var(--card)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.08s',
      }}
    >
      {checked && <CheckIcon size={Math.round(size * 0.65)} style={{ color: '#fff' }} />}
    </span>
  );

  if (label === undefined) {
    return (
      <>
        {input}
        {box}
      </>
    );
  }

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {input}
      {box}
      {label}
    </label>
  );
}
