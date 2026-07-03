'use client';

// Shared on-brand <select> — same visual weight established by FilterSidebar's
// "Trier" select and the profile edit form's "Recherche un·e" role select:
// 2px ink border, bold text, var(--card) background. `.ep-select:focus-visible`
// in globals.css gives it the platform's standard accent focus ring.
import type { SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export default function OnBrandSelect({ className, style, ...rest }: Props) {
  return (
    <select
      className={['ep-select', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        border: '2px solid var(--ink)',
        borderRadius: 6,
        padding: '7px 9px',
        fontSize: 13,
        fontWeight: 700,
        background: 'var(--card)',
        color: 'var(--ink)',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    />
  );
}
