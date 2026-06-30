'use client';

// F-1 slice: logo + "Se connecter" / avatar + "Se déconnecter"
// F-2 adds: role-gated dropdown links, demo role switcher
// F-4 adds: primary nav, search entry point, full avatar dropdown, unread badge,
//           contextual "＋ Poster" button, keyboard a11y
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from '../lib/session';
import { useEffectiveRole } from '../lib/role';
import { useUnreadCount, useUnreadCounts } from '../lib/unread';
import PosterButton from './PosterButton';
import CountBadge from './CountBadge';
// ponytail: message-launcher bubble + chat-list unread dots deferred to MC-9 (no host surface yet)
import type { UserRole } from '@encre-et-plume/shared';

// Avatar initials fallback (halftone-dot texture matches prototype avatar placeholder)
function AvatarFallback({ name }: { name: string }) {
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
        width: 38,
        height: 38,
        borderRadius: '50%',
        border: '2px solid #fff',
        background: 'var(--tone)',
        backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
        backgroundSize: '5px 5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 14,
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

// §5 locked route map — DO NOT invent routes
const NAV_LINKS = [
  { href: '/',              label: 'Accueil'   },
  { href: '/decouvrir',     label: 'Découvrir' },
  { href: '/lire',          label: 'Lire'      },
  { href: '/ecrire',        label: 'Écrire'    },
  { href: '/tableau-de-bord', label: 'Projets' },
  { href: '/contacts',      label: 'Messages'  },
] as const;

// Contextual "＋ Poster" button shown only on these paths
const POSTER_PAGES = new Set(['/decouvrir']);

// Shared menuitem link style (avoids repetition inside the large render)
const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '10px 13px',
  borderBottom: '1.5px solid var(--border)',
  fontSize: 14,
  color: 'var(--ink)',
  textDecoration: 'none',
};

export default function Header() {
  const { account, loading, logout } = useSession();
  const { effectiveRole, setSimulatedRole } = useEffectiveRole();
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const { counts } = useUnreadCounts();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);

  const gatedLinks = ROLE_LINKS.filter((l) => l.role === effectiveRole);

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
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '12px 28px',
        backgroundColor: 'var(--card)',
        backgroundImage: 'linear-gradient(112deg, transparent 73%, #16130f 73%)',
        backgroundSize: '100% 100%',
        borderBottom: '3px solid var(--ink)',
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: 'var(--ink)',
          flexShrink: 0,
        }}
      >
        {/* Accent-filled icon blob matching prototype logo */}
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
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Encre &amp; Plume
        </span>
      </Link>

      {/* Primary nav — F-4 Task 1 */}
      <nav aria-label="Navigation principale" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--ink)',
                textDecoration: 'none',
                letterSpacing: '0.02em',
                borderBottom: isActive ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                transition: 'background 0.1s',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {label}
              {href === '/contacts' && (
                <CountBadge
                  count={counts.messages}
                  label={`${counts.messages} messages non lus`}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search entry point — F-4 Task 2
          ponytail: no-op; F-7 wires global search behavior */}
      <button
        aria-label="Rechercher"
        onClick={() => { /* ponytail: search entry point only; F-7 wires global search */ }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 12px',
          border: '2px solid var(--border)',
          borderRadius: 6,
          background: 'var(--card)',
          color: 'var(--ink2)',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          flexShrink: 0,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Rechercher…
      </button>

      {/* Contextual "＋ Poster" button — F-4 Task 6 */}
      {POSTER_PAGES.has(pathname) && <PosterButton />}

      {/* Auth surface */}
      {loading ? (
        // Skeleton placeholder while session loads
        <div
          aria-hidden="true"
          style={{
            width: 38,
            height: 38,
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
                width={38}
                height={38}
                style={{
                  borderRadius: '50%',
                  border: '2px solid #fff',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <AvatarFallback name={account.displayName} />
            )}
            {/* Unread badge on avatar — F-4 Task 4
                ponytail: stub 0; F-5 replaces via UnreadContext */}
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
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
                  border: '2px solid var(--card)',
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
                width: 240,
                background: 'var(--card)',
                border: '3px solid var(--ink)',
                borderRadius: 8,
                boxShadow: '5px 5px 0 var(--shadow)',
                overflow: 'hidden',
              }}
            >
              {/* User info */}
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
                <AvatarFallback name={account.displayName} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{account.displayName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{account.role}</div>
                </div>
              </div>

              {/* Standard account actions — F-4 Task 3 */}

              {/* Notifications (badge from F-4 Task 4) */}
              <Link
                href="/notifications"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                style={{ ...menuItemStyle, justifyContent: 'space-between' }}
              >
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
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
                style={menuItemStyle}
              >
                Mon profil
              </Link>

              {/* Likes & ma liste */}
              <Link
                href="/ma-liste"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                style={menuItemStyle}
              >
                Likes &amp; ma liste
              </Link>

              {/* Mes candidatures */}
              <Link
                href="/mes-candidatures"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                style={menuItemStyle}
              >
                Mes candidatures
              </Link>

              {/* Candidatures reçues */}
              <Link
                href="/candidatures-recues"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                style={{ ...menuItemStyle, justifyContent: 'space-between' }}
              >
                Candidatures reçues
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
                    <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
                    {label}
                  </span>
                  {/* Signalements badge: only for admin/maintainer (already gated by effectiveRole) */}
                  {href === '/admin' && (
                    <CountBadge
                      count={counts.signalements}
                      label={`${counts.signalements} signalements à traiter`}
                    />
                  )}
                </Link>
              ))}

              {/* Theme toggle slot — F-4 Task 5 seam; F-6 wires Clair/Sombre switching */}
              <div
                style={{
                  padding: '10px 13px',
                  borderBottom: '1.5px solid var(--border)',
                  fontSize: 14,
                  color: 'var(--ink2)',
                  cursor: 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                aria-disabled="true"
              >
                <span>Thème</span>
                {/* ponytail: toggle control deferred to F-6 */}
                <span style={{ fontSize: 11, color: 'var(--ink2)' }}>bientôt</span>
              </div>

              {/* Demo role switcher */}
              <div
                style={{
                  padding: '10px 13px',
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

              {/* Logout action */}
              <button
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 13px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink2)',
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'var(--accent-soft)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'none';
                }}
              >
                Se d&eacute;connecter
              </button>
            </div>
          )}
        </div>
      ) : (
        // Logged-out: sign-in link
        <Link
          href="/connexion"
          style={{
            fontSize: 14,
            fontWeight: 700,
            padding: '9px 16px',
            border: '2px solid var(--ink)',
            background: 'var(--card)',
            color: 'var(--ink)',
            borderRadius: 6,
            textDecoration: 'none',
            boxShadow: '2px 2px 0 var(--shadow)',
            transition: 'background 0.12s',
          }}
        >
          Se connecter
        </Link>
      )}
    </header>
  );
}
