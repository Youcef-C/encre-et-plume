'use client';

// F-19: "Apparence" section — 3-way theme control on top of the F-6 ThemeContext,
// shared with the header toggle so both stay in sync (same context, same setTheme).

import { useTheme } from '../../lib/theme';
import type { ThemePreference } from '@encre-et-plume/shared';

const OPTIONS: { value: ThemePreference; label: string; glyph: string }[] = [
  { value: 'light', label: 'Clair', glyph: '☀' },
  { value: 'dark', label: 'Sombre', glyph: '☾' },
  { value: 'system', label: 'Système', glyph: '⚙' },
];

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset
      role="group"
      aria-label="Thème"
      style={{
        border: '2px solid var(--ink)',
        borderRadius: 6,
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexWrap: 'wrap',
        maxWidth: 420,
      }}
    >
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={theme === opt.value}
          onClick={() => setTheme(opt.value)}
          className="ep-toggle-btn"
          style={{
            flex: '1 1 33%',
            minHeight: 44,
            textAlign: 'center',
            padding: '10px 8px',
            border: 'none',
            borderLeft: i > 0 ? '1px solid var(--ink)' : 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            background: theme === opt.value ? 'var(--accent)' : 'var(--card)',
            color: theme === opt.value ? '#fff' : 'var(--ink)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {opt.glyph} {opt.label}
        </button>
      ))}
    </fieldset>
  );
}
