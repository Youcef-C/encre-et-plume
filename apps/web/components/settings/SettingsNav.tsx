'use client';

// F-19: in-page section nav for /parametres. Plain anchor links (native keyboard nav);
// an IntersectionObserver highlights the current section via aria-current="location".

import { useEffect, useState } from 'react';

const SECTIONS: { id: string; label: string }[] = [
  { id: 'notifications', label: 'Préférences de notification' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'contenu-adulte', label: 'Contenu 18+' },
  { id: 'comptes-bloques', label: 'Comptes bloqués' },
  { id: 'mes-donnees', label: 'Mes données' },
];

/**
 * Sections are collapsible <details>; a nav click expands the target and collapses
 * the others (accordion), synchronously BEFORE the browser performs the anchor
 * scroll so the scroll position is computed against the collapsed layout.
 */
function openSection(id: string): void {
  SECTIONS.forEach(({ id: sectionId }) => {
    const el = document.getElementById(sectionId);
    if (el instanceof HTMLDetailsElement) el.open = sectionId === id;
  });
}

export default function SettingsNav() {
  const [current, setCurrent] = useState<string | null>(null);

  // Deep links (/parametres#securite) must land on an expanded section too.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) openSection(id);
  }, []);

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
        // Always on top while browsing sections: pinned right below the 68px sticky header.
        position: 'sticky',
        top: 68,
        zIndex: 20,
        background: '#fbfaf6', // body background — cards scroll cleanly underneath
        padding: '12px 0',
      }}
    >
      {SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={() => openSection(id)}
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
