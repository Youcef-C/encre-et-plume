'use client';

// DR-3 FE-1 — Work page "Œuvre" composition/shell. Replica of prototype ŒUVRE lines 851-973.
// getWork drives the page state (loading/ready/notfound/error); chapters/planches are fetched
// independently — one failing never blanks the rest of the page (DR-1 pattern).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isWork18Plus, WORK_FORMAT_ILLUSTRATIONS, type ApiError, type WorkDetail, type WorkChaptersResponse, type PlancheDto } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import AgeGate from '../age/AgeGate';
import WorkHero from './WorkHero';
import CollectionOeuvre from './CollectionOeuvre';
import SynopsisBlock from './SynopsisBlock';
import ChapterList from './ChapterList';
import PlancheGrid from './PlancheGrid';
import ReviewsSection from './ReviewsSection';
import { TeamSidebar, DetailsSidebar, SupportCard, FundingGoals } from './Sidebar';
import ShareReportBox from './ShareReportBox';

type State = 'loading' | 'ready' | 'notfound' | 'error' | 'age-refused';

export default function OeuvreClient({ slug }: { slug: string }) {
  const { account } = useSession();
  const router = useRouter();
  const cleared = useAgeCleared(account);
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
        setState(err.error === 'AGE_RESTRICTED' ? 'age-refused' : err.statusCode === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retryKey]);

  // DR-12: a collection (format 'Illustration(s)') has no chapters/planches — skip those fetches once
  // the format is known. `work` is null on the first render (guard returns), so nothing fires early.
  useEffect(() => {
    if (!work || work.format === WORK_FORMAT_ILLUSTRATIONS) return;
    api.getWorkChapters(slug, 1).then(setChapters).catch(() => setChapters(null));
    api.getWorkPlanches(slug).then(setPlanches).catch(() => setPlanches([]));
  }, [slug, work]);

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

  // DR-10: logged-in minor — server-side hard gate, no retry/bypass.
  if (state === 'age-refused') {
    return (
      <div role="alert" style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>
          {error?.message ?? 'Ce contenu est réservé aux adultes.'}
        </p>
        <Link href="/decouvrir" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Catalogue
        </Link>
      </div>
    );
  }

  if (!work) return null;

  // DR-12: collection Œuvre variant — reuses the ŒUVRE shell but the member grid replaces the
  // chapters/planches branch (no reader flow). The 18+ gate below still applies uniformly.
  if (work.format === WORK_FORMAT_ILLUSTRATIONS) {
    const gatedCollection = isWork18Plus(work.audienceRating) && !cleared;
    const collectionContent = <CollectionOeuvre work={work} account={account} />;
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 80px' }}>
        {gatedCollection && <AgeGate onBack={() => router.back()} />}
        {gatedCollection ? (
          <div aria-hidden="true" style={{ filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none' }}>
            {collectionContent}
          </div>
        ) : (
          collectionContent
        )}
      </div>
    );
  }

  // DR-10 (user-specified 2026-07-05): the gate now shows the page BLURRED behind it rather than
  // suppressing the content outright — real content only exists here once the server actually
  // let it load (visitor/self-declaration), so there is something to blur (unlike the 403
  // 'age-refused' minor case above, which never fetches content at all).
  const gated = isWork18Plus(work.audienceRating) && !cleared;

  const content = (
    <>
      <WorkHero work={work} account={account} />

      <div className="ep-oeuvre-columns" style={{ display: 'flex', gap: 26, marginTop: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <SynopsisBlock work={work} />
          {chapters && <ChapterList slug={slug} initialData={chapters} />}
          <PlancheGrid planches={planches} />
          <ReviewsSection work={work} account={account} />
        </div>

        <aside className="ep-oeuvre-aside" style={{ width: 288, flex: 'none' }}>
          <ShareReportBox account={account} />
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
    </>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 80px' }}>
      {/* AgeGate is a viewport-fixed overlay (no positioned ancestor needed) rendered BEFORE the
          blurred content in DOM order: its own Tab-wrap trap only guards forward navigation past
          its last control, so keeping it first means a Shift+Tab from the auto-focused title
          escapes to the page chrome above (pre-existing behavior), never into the blurred content
          below — no extra `inert` plumbing needed. */}
      {gated && <AgeGate onBack={() => router.back()} />}
      {gated ? (
        <div aria-hidden="true" style={{ filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none' }}>
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  );
}
