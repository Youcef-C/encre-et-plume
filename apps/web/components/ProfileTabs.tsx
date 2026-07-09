'use client';

import { useState, useRef } from 'react';
import PortfolioGrid from './PortfolioGrid';
import ProfileWorks from './ProfileWorks';

// F-4 — Accessible tablist with keyboard navigation and 4 profile sections.
const TABS = ['Portfolio', 'Œuvres publiées', 'À propos', 'Avis'] as const;
type Tab = (typeof TABS)[number];

type Props = { slug: string; bio: string | null };

export default function ProfileTabs({ slug, bio }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Portfolio');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setActiveTab(TABS[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <div style={{ marginTop: 18 }}>
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Sections du profil"
        style={{
          display: 'flex',
          gap: 18,
          borderBottom: '2px solid var(--border)',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {TABS.map((tab, i) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              role="tab"
              id={`tab-${i}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${i}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => { tabRefs.current[i] = el; }}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onClick={() => setActiveTab(tab)}
              type="button"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: -2,
                paddingBottom: 8,
                paddingLeft: 0,
                paddingRight: 0,
                paddingTop: 0,
                fontSize: 'inherit',
                fontFamily: 'inherit',
                fontWeight: 'inherit',
                color: isActive ? 'var(--ink)' : 'var(--ink2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab panels — conditionally rendered to avoid dead fetches */}
      {activeTab === 'Portfolio' && (
        <div
          id="tabpanel-0"
          role="tabpanel"
          aria-labelledby="tab-0"
          style={{ marginTop: 16 }}
        >
          <PortfolioGrid slug={slug} />
        </div>
      )}
      {activeTab === 'Œuvres publiées' && (
        <div
          id="tabpanel-1"
          role="tabpanel"
          aria-labelledby="tab-1"
          style={{ marginTop: 16 }}
        >
          <ProfileWorks slug={slug} />
        </div>
      )}
      {activeTab === 'À propos' && (
        <div
          id="tabpanel-2"
          role="tabpanel"
          aria-labelledby="tab-2"
          style={{ marginTop: 16 }}
        >
          {bio ? (
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}>{bio}</p>
          ) : (
            <p style={{ color: 'var(--ink2)', fontSize: 14 }}>
              Aucune biographie pour l&apos;instant.
            </p>
          )}
        </div>
      )}
      {activeTab === 'Avis' && (
        <div
          id="tabpanel-3"
          role="tabpanel"
          aria-labelledby="tab-3"
          style={{ marginTop: 16, color: 'var(--ink2)', fontSize: 14 }}
        >
          À venir
        </div>
      )}
    </div>
  );
}
