'use client';

// CS-2 — client shell for /projet/[slug]: session gate + workspace fetch + ?tab= deep-link.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { ApiError, ProjectWorkspaceResponse } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { getProjectWorkspace } from '../../lib/api';
import ProjectWorkspace, { isWorkspaceTab, type WorkspaceTab } from './ProjectWorkspace';

export default function ProjectWorkspaceClient() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : (params.slug as string);
  const router = useRouter();
  const search = useSearchParams();
  const { account, loading: sessionLoading } = useSession();

  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; data: ProjectWorkspaceResponse } | { kind: 'error' }
  >({ kind: 'loading' });

  const tabParam = search.get('tab');
  const tab: WorkspaceTab = isWorkspaceTab(tabParam) ? tabParam : 'tableau';

  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      router.replace(`/connexion?next=/projet/${slug}`);
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    getProjectWorkspace(slug)
      .then((data) => {
        if (alive) setState({ kind: 'ready', data });
      })
      .catch((_err: ApiError) => {
        if (alive) setState({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [slug, account, sessionLoading, router]);

  function changeTab(t: WorkspaceTab) {
    const qs = t === 'tableau' ? '' : `?tab=${t}`;
    router.replace(`/projet/${slug}${qs}`, { scroll: false });
  }

  if (sessionLoading || !account || state.kind === 'loading') {
    return (
      <div
        role="status"
        aria-label="Chargement…"
        className="ep-skeleton-delayed"
        style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 20px' }}
      >
        <div
          aria-hidden="true"
          style={{ height: 64, background: 'var(--tone)', opacity: 0.4, borderRadius: 10, marginBottom: 12 }}
        />
        <div
          aria-hidden="true"
          style={{ height: 360, background: 'var(--tone)', opacity: 0.3, borderRadius: 10 }}
        />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ maxWidth: 620, margin: '48px auto', padding: '0 20px' }}>
        <div
          style={{
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '6px 6px 0 var(--shadow)',
            background: 'var(--card)',
            padding: '28px 24px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Projet introuvable
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 16 }}>
            Ce projet n&apos;existe pas ou vous n&apos;y avez pas accès.
          </p>
          <Link href="/projets" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            ‹ Projets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ProjectWorkspace slug={slug} workspace={state.data} tab={tab} onTabChange={changeTab} />
  );
}
