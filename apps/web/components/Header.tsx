'use client';

// F-1 slice: logo + "Se connecter" / avatar + "Déconnexion"
// F-2 adds: role-gated dropdown links, demo role switcher
// F-4 adds: primary nav, search entry point, full avatar dropdown, unread badge,
//           contextual "＋ Poster" button, keyboard a11y
// Header structure mirrors prototype TOP NAV section exactly.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from '../lib/session';
import { useEffectiveRole } from '../lib/role';
import { useUnreadCount, useUnreadCounts } from '../lib/unread';
import { useTheme } from '../lib/theme';
import CountBadge from './CountBadge';
import SearchOverlay from './SearchOverlay';
// ponytail: message-launcher bubble + chat-list unread dots deferred to MC-9 (no host surface yet)
import type { UserRole } from '@encre-et-plume/shared';

// Avatar initials fallback with halftone-dot texture.
// size prop lets the dropdown header reuse it at 34px vs nav button at 40px.
function AvatarFallback({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: size >= 40 ? '3px solid #fff' : '2px solid var(--ink)',
        background: 'var(--tone)',
        backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
        backgroundSize: '5px 5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: size >= 40 ? 14 : 12,
        color: 'var(--ink)',
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </span>
  );
}

// ponytail: config array keeps role-gating in one place, no per-link copy/paste
const ROLE_LINKS: { role: UserRole; href: string; label: string; icon: string }[] = [
  { role: 'maintainer', href: '/espace-redaction', label: 'Espace rédaction', icon: '✍' },
  { role: 'editor',     href: '/espace-editeur',   label: 'Espace éditeur',   icon: '◆' },
  { role: 'admin',      href: '/admin',             label: 'Panneau admin',    icon: '⚙' },
];

// Demo role labels matching prototype copy verbatim
const DEMO_ROLES: { role: UserRole; label: string }[] = [
  { role: 'utilisateur', label: 'Lecteur' },
  { role: 'maintainer',  label: 'Rédacteur' },
  { role: 'editor',      label: 'Éditeur' },
  { role: 'admin',       label: 'Admin' },
];

// §prototype TOP NAV: seven primary nav links in exact order.
// Galerie/Actualités/Trouver/Calendrier 404 until their epics land — render anyway per replica.
const NAV_LINKS = [
  { href: '/',           label: 'Accueil'    },
  { href: '/decouvrir',  label: 'Découvrir'  },
  { href: '/galerie',    label: 'Galerie'    },
  { href: '/actualites', label: 'Actualités' },
  { href: '/lire',       label: 'Lire'       },
  { href: '/trouver',    label: 'Trouver'    },
  { href: '/calendrier', label: 'Calendrier' },
] as const;

// ponytail: POSTER_PAGES / PosterButton removed — user confirmed no poster button in nav

// Shared menuitem link style (avoids repetition inside the large render)
const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '10px 13px',
  borderBottom: '1.5px solid var(--border)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--ink)',
  textDecoration: 'none',
};

const iconStyle: React.CSSProperties = { width: 18, textAlign: 'center' };

export default function Header() {
  const { account, loading, logout } = useSession();
  const { effectiveRole, setSimulatedRole } = useEffectiveRole();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const { counts } = useUnreadCounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  const gatedLinks = ROLE_LINKS.filter((l) => l.role === effectiveRole);

  // Role display for dropdown user-info header (real account role, not simulated)
  const roleIcon  = account ? (ROLE_LINKS.find(l => l.role === account.role)?.icon ?? '☆') : '';
  const roleLabel = account ? (DEMO_ROLES.find(r => r.role === account.role)?.label ?? account.role) : '';

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Keyboard nav: Escape closes + focuses avatar; ArrowDown/ArrowUp roving focus among menuitems
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!menuOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        avatarButtonRef.current?.focus();
        return;
      }

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      const focused = document.activeElement as HTMLElement;
      const isAvatarBtn = focused === avatarButtonRef.current;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      if (!items.length) return;
      const isMenuItem = items.includes(focused);
      if (!isAvatarBtn && !isMenuItem) return;

      e.preventDefault();
      const idx = items.indexOf(focused);
      if (e.key === 'ArrowDown') {
        items[(idx + 1) % items.length]?.focus();
      } else {
        items[(idx - 1 + items.length) % items.length]?.focus();
      }
    },
    [menuOpen]
  );

  return (
    <header
      className="ep-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--card)',
        backgroundImage: 'linear-gradient(112deg, transparent 73%, var(--ink) 73%)',
        backgroundSize: '100% 100%',
        borderBottom: '3px solid var(--ink)',
      }}
    >
      {/* Logo — font-size 27px, gap 9px per prototype */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          textDecoration: 'none',
          color: 'var(--ink)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            background: 'var(--accent)',
            border: '3px solid var(--ink)',
            borderRadius: '50% 50% 50% 6px',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          className="ep-logo-text"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Encre &amp; Plume
        </span>
      </Link>

      {/* Mobile hamburger — shown only ≤1024px via CSS (.ep-hamburger) */}
      <button
        type="button"
        className="ep-hamburger"
        aria-label="Ouvrir la navigation"
        aria-expanded={mobileNavOpen}
        aria-controls="ep-mobile-nav"
        onClick={() => setMobileNavOpen((o) => !o)}
        style={{
          width: 40,
          height: 40,
          border: '2px solid var(--ink)',
          borderRadius: 6,
          background: 'var(--card)',
          color: 'var(--ink)',
          fontSize: 18,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {mobileNavOpen ? '✕' : '☰'}
      </button>

      {/* Primary nav — 7 items per prototype TOP NAV (desktop; hidden ≤1024px) */}
      <nav aria-label="Navigation principale" className="ep-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700 }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="ep-nav-link"
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile nav drawer — shown ≤1024px when toggled; replicates the same 7 links + search */}
      {mobileNavOpen && (
        <nav id="ep-mobile-nav" className="ep-mobile-nav" aria-label="Navigation principale (mobile)">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className="ep-mobile-nav-link"
              onClick={() => setMobileNavOpen(false)}
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            className="ep-mobile-nav-link"
            onClick={() => {
              setMobileNavOpen(false);
              setSearchOpen(true);
            }}
          >
            ⌕ Rechercher…
          </button>
        </nav>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search — full pill with placeholder text per prototype; clicks open F-7 overlay */}
      <button
        ref={searchButtonRef}
        aria-label="Rechercher"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen(true)}
        className="ep-search-btn ep-search-desktop"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 14px',
          border: '2px solid var(--ink)',
          borderRadius: 6,
          color: 'var(--ink2)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'text',
          fontFamily: 'var(--font-body)',
          // Elastic: the search pill is the header's only shrinkable element — it absorbs
          // the 1025–1280px band so the nav/pills never overflow (label truncates via CSS).
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        <span aria-hidden="true">⌕</span>
        <span className="ep-search-label">Rechercher un titre, un·e auteur·rice…</span>
      </button>

      {/* F-7 search overlay */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          searchButtonRef.current?.focus();
        }}
      />

      {/* ♥ Ma liste + Projets — logged-in only per user requirement */}
      {account && (
        <>
          <Link
            href="/ma-liste"
            aria-label="Ma liste"
            aria-current={pathname === '/ma-liste' ? 'page' : undefined}
            title="Ma liste &amp; coups de cœur"
            className="ep-pill-btn ep-pill-desktop"
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              border: '2px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            ♥
          </Link>
          <Link
            href="/tableau-de-bord"
            aria-current={pathname === '/tableau-de-bord' ? 'page' : undefined}
            className="ep-pill-btn ep-pill-desktop"
            style={{
              fontSize: 14,
              fontWeight: 700,
              padding: '9px 16px',
              border: '2px solid #fff',
              borderRadius: 6,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Projets
          </Link>
        </>
      )}

      {/* Auth surface */}
      {loading ? (
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--tone)',
            border: '2px solid var(--border)',
            opacity: 0.5,
          }}
        />
      ) : account ? (
        // Logged-in: avatar button + dropdown
        <div
          ref={menuRef}
          style={{ position: 'relative' }}
          onKeyDown={handleContainerKeyDown}
        >
          <button
            ref={avatarButtonRef}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Menu de ${account.displayName}${unreadCount > 0 ? `, ${unreadCount} notifications non lues` : ''}`}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {account.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.avatar}
                alt={account.displayName}
                width={40}
                height={40}
                style={{
                  borderRadius: '50%',
                  border: '3px solid #fff',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <AvatarFallback name={account.displayName} size={40} />
            )}
            {/* Unread badge on avatar — F-4 Task 4 / F-5 real count */}
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  border: '2px solid #fff',
                  lineHeight: 1,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Menu utilisateur"
              style={{
                position: 'absolute',
                top: 50,
                right: 0,
                zIndex: 50,
                width: 236,
                background: 'var(--card)',
                border: '3px solid var(--ink)',
                borderRadius: 8,
                boxShadow: '5px 5px 0 var(--shadow)',
                overflow: 'hidden',
              }}
            >
              {/* User info header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '11px 13px',
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--paper)',
                }}
              >
                <AvatarFallback name={account.displayName} size={34} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{account.displayName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{roleIcon} {roleLabel}</div>
                </div>
              </div>

              {/* Notifications */}
              <Link
                href="/notifications"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={{ ...menuItemStyle, justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={iconStyle}>✉</span>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>

              {/* Mon profil */}
              <Link
                href={`/${account.slug}`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={menuItemStyle}
              >
                <span style={iconStyle}>◷</span>
                Mon profil
              </Link>

              {/* ponytail: Revenus item omitted — MR-* monetization not built; add when MR-2 lands */}

              {/* Likes & ma liste */}
              <Link
                href="/ma-liste"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={menuItemStyle}
              >
                <span style={{ ...iconStyle, color: 'var(--accent)' }}>♥</span>
                Likes &amp; ma liste
              </Link>

              {/* Mes candidatures */}
              <Link
                href="/mes-candidatures"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={menuItemStyle}
              >
                <span style={iconStyle}>✎</span>
                Mes candidatures
              </Link>

              {/* Candidatures reçues */}
              <Link
                href="/candidatures-recues"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={{ ...menuItemStyle, borderBottom: '2px solid var(--border)', justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={iconStyle}>↧</span>
                  Candidatures reçues
                </span>
                <CountBadge
                  count={counts.demandes}
                  label={`${counts.demandes} demandes en attente`}
                />
              </Link>

              {/* Role-gated links — hidden (not disabled) when role lacks access */}
              {gatedLinks.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '10px 13px',
                    borderBottom: '1.5px solid var(--border)',
                    fontSize: 14,
                    fontWeight: 700,
                    background: 'var(--accent-soft)',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={iconStyle}>{icon}</span>
                    {label}
                  </span>
                  {href === '/admin' && (
                    <CountBadge
                      count={counts.signalements}
                      label={`${counts.signalements} signalements à traiter`}
                    />
                  )}
                </Link>
              ))}

              {/* MODE DÉMO · RÔLE switcher */}
              <div
                style={{
                  padding: '9px 13px',
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--paper)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--ink2)',
                    marginBottom: 7,
                  }}
                >
                  MODE DÉMO · RÔLE{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {DEMO_ROLES.find((r) => r.role === effectiveRole)?.label ?? effectiveRole}
                  </strong>
                </div>
                <fieldset
                  role="group"
                  aria-label="Changer de rôle (démo)"
                  style={{
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 5,
                  }}
                >
                  {DEMO_ROLES.map(({ role, label }) => (
                    <button
                      key={role}
                      type="button"
                      aria-label={label}
                      aria-pressed={effectiveRole === role}
                      onClick={() => setSimulatedRole(role === effectiveRole ? null : role)}
                      className="ep-toggle-btn"
                      style={{
                        textAlign: 'center',
                        border: `2px solid ${effectiveRole === role ? 'var(--accent)' : 'var(--ink)'}`,
                        borderRadius: 6,
                        padding: '5px 4px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: effectiveRole === role ? 'var(--accent-soft)' : 'var(--card)',
                        color: 'var(--ink)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </fieldset>
              </div>

              {/* F-14: Paramètres → /parametres */}
              <Link
                href="/parametres"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="ep-menu-item"
                style={menuItemStyle}
              >
                <span style={iconStyle}>⚙</span>
                Paramètres
              </Link>

              {/* PARAMÈTRES · THÈME — grouped pill per prototype */}
              <div
                style={{
                  padding: '9px 13px',
                  borderBottom: '2px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--ink2)',
                    marginBottom: 7,
                  }}
                >
                  PARAMÈTRES · THÈME
                </div>
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
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={theme === 'light'}
                    onClick={() => setTheme('light')}
                    className="ep-toggle-btn"
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '5px',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: theme === 'light' ? 'var(--accent)' : 'var(--card)',
                      color: theme === 'light' ? '#fff' : 'var(--ink)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    &#9728; Clair
                  </button>
                  <button
                    type="button"
                    aria-pressed={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    className="ep-toggle-btn"
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '5px',
                      border: 'none',
                      borderLeft: '1px solid var(--ink)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: theme === 'dark' ? 'var(--accent)' : 'var(--card)',
                      color: theme === 'dark' ? '#fff' : 'var(--ink)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    &#9790; Sombre
                  </button>
                </fieldset>
              </div>

              {/* Déconnexion — prototype text; hover via ep-menu-item CSS class */}
              <button
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                }}
                className="ep-menu-item"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 13px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink2)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      ) : (
        // Logged-out: sign-in link
        <Link
          href="/connexion"
          className="ep-connect-btn"
          style={{
            fontSize: 14,
            fontWeight: 700,
            padding: '9px 16px',
            border: '2px solid var(--ink)',
            color: 'var(--ink)',
            borderRadius: 6,
            textDecoration: 'none',
            boxShadow: '2px 2px 0 var(--shadow)',
          }}
        >
          Se connecter
        </Link>
      )}
    </header>
  );
}
