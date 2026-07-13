'use client';

// CS-2 — the "Espace projet" shell: replica of prototype data-page="projet" (header + 6-tab bar).
// Tabs are an ARIA tablist, deep-linkable via ?tab=. Header action buttons render per the replica but
// no-op this story (their target screens are future stories: CS-10 / CS-4 / CS-6/CS-9).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ProjectWorkspaceResponse, MyProjectItem } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { getMyProjects } from '../../lib/api';
import { PenNibIcon, BrushIcon, CaretDownIcon } from '../icons';
import KanbanBoard from './KanbanBoard';
import InfosPanel from './InfosPanel';
import PlaceholderPanel from './PlaceholderPanel';
import FichiersPanel from './FichiersPanel';

export const WORKSPACE_TABS = [
  'tableau',
  'chapitres',
  'fichiers',
  'discussion',
  'soutien',
  'infos',
] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

const TAB_LABELS: Record<WorkspaceTab, string> = {
  tableau: 'Tableau',
  chapitres: 'Chapitres',
  fichiers: 'Fichiers',
  discussion: 'Discussion',
  soutien: 'Soutien',
  infos: 'Infos',
};

export function isWorkspaceTab(v: string | null | undefined): v is WorkspaceTab {
  return !!v && (WORKSPACE_TABS as readonly string[]).includes(v);
}

// One icon per active profile role — both pen ✒ and brush 🖌 when the user is scénariste AND
// dessinateur. Order is set server-side (scenariste first).
function RoleIcons({ roles }: { roles: string[] }) {
  return (
    <>
      {roles.map((role) => {
        if (role === 'dessinateur' || role === 'dessinatrice')
          return <BrushIcon key={role} size={12} style={{ display: 'inline', marginLeft: 3 }} />;
        if (role === 'scenariste')
          return <PenNibIcon key={role} size={12} style={{ display: 'inline', marginLeft: 3 }} />;
        return null;
      })}
    </>
  );
}

/**
 * Project title + a caret that opens a switcher listing the viewer's other manga/roman projects
 * (illustration collections excluded). Clicking one navigates straight to its workspace.
 */
function ProjectSwitcher({ currentSlug, title }: { currentSlug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<MyProjectItem[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || projects !== null) return;
    getMyProjects()
      // Only navigable manga/roman projects (kind 'project' with a slug) — not collections/illustrations.
      .then((res) => setProjects(res.items.filter((p) => p.kind === 'project' && !!p.slug)))
      .catch(() => setProjects([]));
  }, [open, projects]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase' }}>
        {title}
      </span>
      <button
        type="button"
        aria-label="Changer de projet"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          border: '2px solid var(--ink)',
          borderRadius: 6,
          background: 'var(--card)',
          cursor: 'pointer',
          color: 'var(--ink)',
        }}
      >
        <CaretDownIcon size={13} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            zIndex: 40,
            minWidth: 240,
            maxHeight: 340,
            overflowY: 'auto',
            border: '2px solid var(--ink)',
            borderRadius: 8,
            background: 'var(--card)',
            boxShadow: '4px 4px 0 var(--shadow)',
            padding: 6,
          }}
        >
          {projects === null && (
            <div style={{ fontSize: 12, color: 'var(--ink2)', padding: '6px 8px' }}>Chargement…</div>
          )}
          {projects?.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink2)', padding: '6px 8px' }}>Aucun autre projet</div>
          )}
          {projects?.map((p) => {
            const active = p.slug === currentSlug;
            return (
              <Link
                key={p.slug}
                href={`/projet/${p.slug}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '7px 9px',
                  borderRadius: 5,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                {p.title}
                {p.type && (
                  <span style={{ fontWeight: 500, color: 'var(--ink2)', marginLeft: 6 }}>· {p.type}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface ProjectWorkspaceProps {
  slug: string;
  workspace: ProjectWorkspaceResponse;
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

export default function ProjectWorkspace({
  slug,
  workspace,
  tab,
  onTabChange,
}: ProjectWorkspaceProps) {
  const [title, setTitle] = useState(workspace.title);
  const isMember = workspace.viewer.isMember;
  const { account } = useSession();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % WORKSPACE_TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = WORKSPACE_TABS.length - 1;
    else return;
    e.preventDefault();
    const t = WORKSPACE_TABS[next];
    onTabChange(t);
    tabRefs.current[next]?.focus();
  }

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 20px 70px' }}>
      <div
        style={{
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 10,
          // No overflow:hidden — it would make this a non-scrolling scroll container and neutralize
          // the tab bar's position:sticky against the page. Corners still read fine (nothing full-bleed
          // reaches them). The tab bar's own background clips content scrolling under it instead.
          boxShadow: '6px 6px 0 var(--shadow)',
        }}
      >
        {/* Header (proto 1295–1304) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            padding: '14px 18px',
            borderBottom: '3px solid var(--ink)',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/projets"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }}
          >
            ‹ Projets
          </Link>
          <ProjectSwitcher currentSlug={slug} title={title} />
          {/* Overlapping avatar stack */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {workspace.members.slice(0, 4).map((m, i) =>
              m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.accountId}
                  src={m.avatar}
                  alt=""
                  width={28}
                  height={28}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '2px solid var(--ink)',
                    objectFit: 'cover',
                    marginLeft: i === 0 ? 0 : -8,
                    display: 'block',
                  }}
                />
              ) : (
                <span
                  key={m.accountId}
                  aria-hidden="true"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'var(--tone)',
                    border: '2px solid var(--ink)',
                    marginLeft: i === 0 ? 0 : -8,
                    display: 'block',
                  }}
                />
              ),
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>
            {workspace.members.map((m, i) => (
              <span key={m.accountId}>
                {i > 0 && <span>{workspace.members.length === 2 ? ' & ' : ' · '}</span>}
                <span>{m.displayName}</span>
                <RoleIcons roles={m.roles} />
              </span>
            ))}
          </span>
          <div style={{ flex: 1 }} />
          {isMember && (
            <>
              <button type="button" style={headerBtn}>
                Gérer le groupe
              </button>
              <button type="button" style={headerBtn}>
                Éditeur
              </button>
              <button
                type="button"
                aria-label="Publier"
                style={{
                  ...headerBtn,
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '2px 2px 0 var(--shadow)',
                }}
              >
                Publier ▾
              </button>
            </>
          )}
        </div>

        {/* Tab bar (proto 1305) — ARIA tablist. Sticks just below the 68px sticky global Header so it
            stays visible as the page scrolls; its var(--card) background hides panel content passing
            under it, and z-index 20 stays below the global Header (z 30). */}
        <div
          role="tablist"
          aria-label="Sections du projet"
          style={{
            position: 'sticky',
            top: 68,
            zIndex: 20,
            background: 'var(--card)',
            display: 'flex',
            gap: 18,
            padding: '11px 18px',
            borderBottom: '2px solid var(--border)',
            fontSize: 14,
            fontWeight: 700,
            flexWrap: 'wrap',
          }}
        >
          {WORKSPACE_TABS.map((t, i) => {
            const selected = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={selected}
                aria-controls={`panel-${t}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(t)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '0 0 9px',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: selected ? 'var(--ink)' : 'var(--ink2)',
                  borderBottom: selected ? '3px solid var(--accent)' : '3px solid transparent',
                  minHeight: 34,
                }}
              >
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'tableau' && (
            <KanbanBoard
              slug={slug}
              chapters={workspace.chapters}
              initialPages={workspace.pages}
              readOnly={!isMember}
              members={workspace.members}
              labels={workspace.labels}
              isOwner={workspace.viewer.isOwner}
              viewerId={account?.id ?? null}
            />
          )}
          {tab === 'infos' && (
            <InfosPanel
              slug={slug}
              workspace={workspace}
              readOnly={!isMember}
              onTitleSaved={setTitle}
            />
          )}
          {tab === 'chapitres' && (
            <PlaceholderPanel title="Chapitres" note="La gestion des chapitres arrive bientôt." />
          )}
          {tab === 'fichiers' && (
            <FichiersPanel slug={slug} pages={workspace.pages} readOnly={!isMember} />
          )}
          {tab === 'discussion' && (
            <PlaceholderPanel
              title="Discussion du projet"
              note="La discussion d'équipe arrive bientôt."
            />
          )}
          {tab === 'soutien' && (
            <PlaceholderPanel title="Soutien du projet" note="Le panneau de soutien arrive bientôt." />
          )}
        </div>
      </div>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 14px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 36,
};
