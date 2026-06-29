'use client';

// F-1 slice of the header: logo + "Se connecter" (logged-out) | avatar + "Se déconnecter" (logged-in).
// F-2 adds: role-gated dropdown links, editor banner anchor, demo role switcher.
// F-4 will add full nav links, search, and the complete avatar dropdown.
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useSession } from '../lib/session';
import { useEffectiveRole } from '../lib/role';
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

export default function Header() {
  const { account, loading, logout } = useSession();
  const { effectiveRole, setSimulatedRole } = useEffectiveRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const gatedLinks = ROLE_LINKS.filter((l) => l.role === effectiveRole);

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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

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
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Menu de ${account.displayName}`}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
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
                width: 220,
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
                  }}
                >
                  <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
                  {label}
                </Link>
              ))}

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
