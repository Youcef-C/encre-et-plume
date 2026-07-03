'use client';

// DR-3 FE-1 — Work page "Œuvre" composition/shell. Replica of prototype ŒUVRE lines 851-973.
// getWork drives the page state (loading/ready/notfound/error); chapters/planches are fetched
// independently — one failing never blanks the rest of the page (DR-1 pattern).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApiError, WorkDetail, WorkChaptersResponse, PlancheDto } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import WorkHero from './WorkHero';
import SynopsisBlock from './SynopsisBlock';
import ChapterList from './ChapterList';
import PlancheGrid from './PlancheGrid';
import ReviewsSection from './ReviewsSection';
import { TeamSidebar, DetailsSidebar, SupportCard, FundingGoals } from './Sidebar';

type State = 'loading' | 'ready' | 'notfound' | 'error';

export default function OeuvreClient({ slug }: { slug: string }) {
  const { account } = useSession();
  const [state, setState] = useState<State>('loading');
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [chapters, setChapters] = useState<WorkChaptersResponse | null>(null);
  const [planches, setPlanches] = useState<PlancheDto[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .getWork(slug)
      .then((data) => {
        if (cancelled) return;
        setWork(data);
        setState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err);
        setState(err.statusCode === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retryKey]);

  useEffect(() => {
    api.getWorkChapters(slug, 1).then(setChapters).catch(() => setChapters(null));
    api.getWorkPlanches(slug).then(setPlanches).catch(() => setPlanches([]));
  }, [slug]);

  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-label="Chargement de l'œuvre…"
        className="ep-skeleton-delayed"
        style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 80px' }}
      >
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div aria-hidden="true" style={{ width: 240, height: 330, background: 'var(--tone)', opacity: 0.5, borderRadius: 10 }} />
          <div style={{ flex: 1, minWidth: 280 }}>
            <div aria-hidden="true" style={{ height: 48, width: '60%', background: 'var(--tone)', opacity: 0.5, marginBottom: 16, borderRadius: 4 }} />
            <div aria-hidden="true" style={{ height: 16, width: '40%', background: 'var(--tone)', opacity: 0.4, borderRadius: 4 }} />
          </div>
        </div>
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <Link href="/decouvrir" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Catalogue
        </Link>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 56px)', textTransform: 'uppercase', margin: '20px 0 12px' }}>
          Œuvre introuvable
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Cette œuvre n&apos;existe pas ou a été dépubliée.</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
          {error?.message ?? 'Impossible de charger cette œuvre.'}
        </p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!work) return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 80px' }}>
      <WorkHero work={work} account={account} />

      <div className="ep-oeuvre-columns" style={{ display: 'flex', gap: 26, marginTop: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <SynopsisBlock work={work} />
          {chapters && <ChapterList slug={slug} initialData={chapters} />}
          <PlancheGrid planches={planches} />
          <ReviewsSection work={work} account={account} />
        </div>

        <aside className="ep-oeuvre-aside" style={{ width: 288, flex: 'none' }}>
          <TeamSidebar team={work.team} account={account} />
          <DetailsSidebar
            format={work.format}
            complete={work.complete}
            chapterCount={work.chapterCount}
            audienceRating={work.audienceRating}
            publishedAt={work.publishedAt}
          />
          <SupportCard account={account} />
          <FundingGoals goals={work.fundingGoals} />
        </aside>
      </div>
    </div>
  );
}
