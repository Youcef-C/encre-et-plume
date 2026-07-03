'use client';

// F-19: in-page section nav for /parametres. Plain anchor links (native keyboard nav);
// an IntersectionObserver highlights the current section via aria-current="location".

import { useEffect, useState } from 'react';

const SECTIONS: { id: string; label: string }[] = [
  { id: 'apparence', label: 'Apparence' },
  { id: 'notifications', label: 'Préférences de notification' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'mes-donnees', label: 'Mes données' },
];

export default function SettingsNav() {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // ponytail: IntersectionObserver scroll-spy; a click-only active state would also satisfy "indicated".
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Sections des paramètres"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 28,
      }}
    >
      {SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={current === id ? 'location' : undefined}
          className="ep-toggle-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            background: current === id ? 'var(--accent)' : 'var(--card)',
            color: current === id ? '#fff' : 'var(--ink)',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
