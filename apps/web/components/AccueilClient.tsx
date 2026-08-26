'use client';

// DR-1 — "Accueil" showroom composition. Fetches all six /home/* feeds in parallel;
// each section owns its own loading/error state independently (F-h) — one rejected
// feed never blanks the sibling sections. Replica of prototype ACCUEIL lines 385-495.
import * as api from '../lib/api';
import { useFetchState } from '../lib/useFetchState';
import HeroCarousel from './HeroCarousel';
import AnnouncementRibbon from './AnnouncementRibbon';
import TrendingGrid from './TrendingGrid';
import TopCreators from './TopCreators';
import ScheduledReleases from './ScheduledReleases';
import CommunityBand from './CommunityBand';
import RankingSidebar from './RankingSidebar';

// DR-14 F13: the private `useHomeSection` (a hand-rolled loading/error effect with its own
// `cancelled` flag) was the first caller retired in favour of the shared `useFetchState` — same
// per-section independence, but a transient failure now keeps the skeleton and retries.
interface SectionState<T> {
  loading: boolean;
  error: boolean;
  data: T | null;
}

function useHomeSection<T>(fetcher: () => Promise<T>): SectionState<T> {
  const { state, data } = useFetchState(fetcher, []);
  return { loading: state === 'loading', error: state === 'error', data };
}

function Section<T>({
  state,
  skeletonHeight,
  render,
}: {
  state: SectionState<T>;
  skeletonHeight: number;
  render: (data: T) => React.ReactNode;
}) {
  if (state.loading) {
    return (
      <div
        role="status"
        aria-label="Chargement…"
        className="ep-skeleton-delayed"
        style={{ height: skeletonHeight, borderRadius: 8, border: '3px solid var(--tone)', background: 'var(--tone)', opacity: 0.5 }}
      />
    );
  }
  if (state.error) {
    return (
      <p role="alert" style={{ color: 'var(--accent)', fontSize: 14, padding: '12px 0', fontWeight: 600 }}>
        Section indisponible. Veuillez réessayer plus tard.
      </p>
    );
  }
  return <>{render(state.data as T)}</>;
}

export default function AccueilClient() {
  const featured = useHomeSection(api.getFeatured);
  const announcements = useHomeSection(api.getAnnouncements);
  const trending = useHomeSection(api.getTrending);
  const topCreators = useHomeSection(api.getTopCreators);
  const scheduled = useHomeSection(api.getScheduledReleases);
  const ranking = useHomeSection(api.getRankingAllTime);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '26px 28px 80px' }}>
      <Section state={featured} skeletonHeight={400} render={(data) => <HeroCarousel slides={data} />} />
      <Section state={announcements} skeletonHeight={54} render={(data) => <AnnouncementRibbon items={data} />} />

      <div className="ep-accueil-columns" style={{ display: 'flex', gap: 28, alignItems: 'flex-start', marginTop: 30, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section state={trending} skeletonHeight={330} render={(data) => <TrendingGrid items={data} />} />
          <Section state={topCreators} skeletonHeight={160} render={(data) => <TopCreators data={data} />} />
          <Section state={scheduled} skeletonHeight={200} render={(data) => <ScheduledReleases items={data} />} />
          <CommunityBand />
        </div>
        <div className="ep-accueil-sidebar" style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 88 }}>
          <Section state={ranking} skeletonHeight={400} render={(data) => <RankingSidebar items={data} />} />
        </div>
      </div>
    </div>
  );
}
