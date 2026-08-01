'use client';

// CS-4 (iter 2, U7) — topbar page/chapter navigator next to the work title. Replaces the round-1
// display-only chapter chip: a ProjectSwitcher-style on-brand popover grouped by chapter, one row per
// page/card; selecting a page navigates to /projet/[slug]/editeur/[pageId]. Data reuses the CS-2
// workspace payload (GET /projects/:slug), lazy-fetched on first open (D10 — no new endpoint).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectWorkspaceResponse, WorkspaceChapter, WorkspacePage } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { CheckIcon, FileTextIcon } from '../icons';

interface Group {
  chapter: WorkspaceChapter;
  pages: WorkspacePage[];
}

function groupPages(ws: ProjectWorkspaceResponse): Group[] {
  const groups: Group[] = ws.chapters
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((chapter) => ({ chapter, pages: ws.pages.filter((p) => p.chapterId === chapter.id) }));
  // R2-1d: every card belongs to a chapter, so there is no orphan group left to append.
  return groups;
}

export default function PageSwitcher({
  slug,
  currentPageId,
  label,
  hrefFor,
}: {
  slug: string;
  currentPageId: string;
  /** The trigger label — the current chapter's title, or "Hors chapitre". */
  label: string;
  /** CS-5 — optional destination override (e.g. the revision route) instead of the editor route. */
  hrefFor?: (pageId: string) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ws, setWs] = useState<ProjectWorkspaceResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Lazy-fetch the workspace on first open (cached for the route's lifetime).
  useEffect(() => {
    if (!open || ws) return;
    let alive = true;
    setLoadError(false);
    api
      .getProjectWorkspace(slug)
      .then((data) => alive && setWs(data))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [open, ws, slug]);

  // Close on outside pointerdown + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (pageId: string) => {
    setOpen(false);
    if (pageId !== currentPageId) router.push(hrefFor ? hrefFor(pageId) : `/projet/${slug}/editeur/${pageId}`);
  };

  // Arrow-key navigation across the flat option list.
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const opts = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!opts.length) return;
    e.preventDefault();
    const idx = opts.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, opts.length - 1) : Math.max(idx - 1, 0);
    opts[idx < 0 ? 0 : next]?.focus();
  };

  const groups = ws ? groupPages(ws) : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Changer de page ou de chapitre"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          fontWeight: 700,
          border: '2px solid var(--ink)',
          borderRadius: 6,
          padding: '5px 12px',
          minHeight: 32,
          background: 'var(--card)',
          color: 'var(--ink)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {label} <span style={{ color: 'var(--ink2)' }} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            zIndex: 40,
            width: 280,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 380,
            overflow: 'auto',
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '5px 5px 0 var(--shadow)',
          }}
        >
          {loadError ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink2)' }}>Chargement impossible. Réessayez.</div>
          ) : !ws ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink2)' }}>Chargement…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ink2)' }}>Aucune page</div>
          ) : (
            <ul ref={listRef} role="listbox" aria-label="Pages et chapitres" onKeyDown={onListKeyDown} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {groups.map((g) => (
                <li key={g.chapter.id} role="presentation">
                  <div style={{ padding: '9px 13px 5px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink2)', borderTop: '2px solid var(--border)' }}>
                    {chapterHeading(g.chapter)}
                  </div>
                  {g.pages.length === 0 ? (
                    <div style={{ padding: '4px 13px 9px', fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>Aucune page</div>
                  ) : (
                    <ul role="presentation" style={{ listStyle: 'none', margin: 0, padding: '0 0 5px' }}>
                      {g.pages.map((p) => {
                        const current = p.id === currentPageId;
                        const hasScenario = p.fileTags.includes('scenario');
                        return (
                          <li key={p.id} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={current}
                              aria-current={current ? 'page' : undefined}
                              onClick={() => go(p.id)}
                              style={{
                                display: 'flex',
                                width: '100%',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 13px',
                                minHeight: 40,
                                border: 'none',
                                background: current ? 'var(--accent-soft)' : 'transparent',
                                fontFamily: 'inherit',
                                fontSize: 13,
                                fontWeight: current ? 700 : 500,
                                color: 'var(--ink)',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              {current ? <CheckIcon size={14} /> : <span style={{ width: 14 }} aria-hidden="true" />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                              {hasScenario && (
                                <span title="Scénario" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
                                  <FileTextIcon size={12} /> scénario
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function chapterHeading(c: WorkspaceChapter): string {
  const title = c.title?.trim();
  return title ? `Chapitre ${c.number} — ${title}` : `Chapitre ${c.number}`;
}
