import { Injectable } from '@nestjs/common';
import type { CreatorRole, MatchSuggestion, MatchSuggestionsResponse } from '@encre-et-plume/shared';
import { CREATOR_ROLES, resolveGenre } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Scoring weights — "formula left open / tunable" per the story. Tweak here; nothing else changes.
const GENRE_WEIGHT = 40;
const STYLE_WEIGHT = 25;
const RHYTHM_BONUS = 15;
const ROLE_BONUS = 20;

const CACHE_TTL_S = 60; // per-viewer, fail-open (same pattern as GalleryService).
const CANDIDATE_SCAN = 200; // ponytail: bounded scan, move scoring into SQL if the creator pool outgrows it.
const ORDER_BY = [{ trendingScore: 'desc' as const }, { createdAt: 'asc' as const }];

const CANDIDATE_SELECT = {
  accountId: true,
  tags: true,
  seekingGenres: true,
  seekingProjectLength: true,
  creatorRoles: true,
  trendingScore: true,
  createdAt: true,
  account: { select: { profileSlug: true, displayName: true, avatar: true } },
};

interface CandidateRow {
  accountId: string;
  tags: string[];
  seekingGenres: string[];
  seekingProjectLength: string | null;
  creatorRoles: string[];
  trendingScore: number;
  createdAt: Date;
  account: { profileSlug: string; displayName: string; avatar: string | null };
}

interface ViewerRow {
  tags: string[];
  seekingGenres: string[];
  seekingProjectLength: string | null;
  seekingTargetRole: string | null;
  creatorRoles: string[];
}

/** NFD fold for accent/case-insensitive style-tag compare (genres are already canonicalised). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Split a tag list into canonical F-20 genre fr-labels and free-form style tags. */
function splitTags(tags: string[], seekingGenres: string[] = []): { genres: Set<string>; styles: string[] } {
  const genres = new Set<string>();
  const styles: string[] = [];
  for (const tag of tags) {
    const fr = resolveGenre(tag);
    if (fr) genres.add(fr);
    else styles.push(tag);
  }
  for (const g of seekingGenres) {
    const fr = resolveGenre(g);
    if (fr) genres.add(fr);
  }
  return { genres, styles };
}

/**
 * MC-2 "Suggestions — par affinité de style & genre". Read-only, JWT-guarded, cached per viewer in
 * Redis (fail-open). Scores creator profiles against the viewer's own F-3 tags/seeking prefs with a
 * simple tunable heuristic; complementary-role preference is a soft bonus, never a filter.
 *
 * AD-6 (ban/suspension) is unbuilt: when the ban flag lands it joins the `account` clause below
 * (e.g. `account: { deletedAt: null, bannedAt: null }`), same as PartnersService. MC-8 close-connection
 * exclusion is likewise unbuilt: it joins the WHERE (`accountId: { notIn: [...connectedIds] }`) here.
 */
@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSuggestions(viewerAccountId: string, limit: number): Promise<MatchSuggestionsResponse> {
    const key = `matches:sugg:${viewerAccountId}:${limit}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as MatchSuggestionsResponse;

    const result = await this.compute(viewerAccountId, limit);
    await this.redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL_S);
    return result;
  }

  private async compute(viewerAccountId: string, limit: number): Promise<MatchSuggestionsResponse> {
    const viewer = (await this.prisma.profile.findUnique({
      where: { accountId: viewerAccountId },
      select: { tags: true, seekingGenres: true, seekingProjectLength: true, seekingTargetRole: true, creatorRoles: true },
    })) as ViewerRow | null;

    const { genres: viewerGenres, styles: viewerStyles } = viewer
      ? splitTags(viewer.tags, viewer.seekingGenres)
      : { genres: new Set<string>(), styles: [] };

    // Minimum-data guard: no genre/style signal → no honest affinity to report.
    if (viewerGenres.size + viewerStyles.length === 0) {
      return { items: [], incompleteProfile: true };
    }

    const viewerStyleKeys = new Set(viewerStyles.map(fold));
    const viewerRhythm = viewer!.seekingProjectLength;
    const preferredRole = derivePreferredRole(viewer!);

    const rows = (await this.prisma.profile.findMany({
      where: {
        account: { deletedAt: null }, // tombstoned out; AD-6 ban flag joins here later
        accountId: { not: viewerAccountId }, // self-exclusion (MC-8 close-connections join here later)
        NOT: { creatorRoles: { isEmpty: true } }, // creators only
      },
      orderBy: ORDER_BY,
      take: CANDIDATE_SCAN,
      select: CANDIDATE_SELECT,
    })) as CandidateRow[];

    const scored = rows
      .map((row) => this.score(row, viewerGenres, viewerStyleKeys, viewerRhythm, preferredRole))
      .filter((s): s is Scored => s !== null)
      .sort(byScore)
      .slice(0, limit)
      .map((s) => s.item);

    return { items: scored, incompleteProfile: false };
  }

  private score(
    row: CandidateRow,
    viewerGenres: Set<string>,
    viewerStyleKeys: Set<string>,
    viewerRhythm: string | null,
    preferredRole: CreatorRole | null,
  ): Scored | null {
    const { genres: candGenres, styles: candStyles } = splitTags(row.tags, row.seekingGenres);
    const sharedGenres = [...candGenres].filter((g) => viewerGenres.has(g));
    const sharedStyles = candStyles.filter((s) => viewerStyleKeys.has(fold(s)));

    // Qualification: a rhythm/role bonus alone never earns a suggestion — the reason must name a real affinity.
    if (sharedGenres.length + sharedStyles.length === 0) return null;

    const rhythmMatch = !!viewerRhythm && row.seekingProjectLength === viewerRhythm;
    const roleMatch = !!preferredRole && row.creatorRoles.includes(preferredRole);

    const raw =
      (GENRE_WEIGHT * sharedGenres.length) / Math.max(1, viewerGenres.size) +
      (STYLE_WEIGHT * sharedStyles.length) / Math.max(1, viewerStyleKeys.size) +
      (rhythmMatch ? RHYTHM_BONUS : 0) +
      (roleMatch ? ROLE_BONUS : 0);
    const affinityScore = Math.min(100, Math.round(raw));

    // Reason: applicable fragments in priority order, joined by " · ", max 2.
    const fragments: string[] = [];
    if (sharedGenres.length) fragments.push('même genre');
    if (rhythmMatch) fragments.push('rythme compatible');
    if (sharedStyles.length) fragments.push('style proche de vos refs');
    if (roleMatch) fragments.push('rôle complémentaire');

    const genre = sharedGenres[0] ?? [...candGenres][0] ?? null;

    const item: MatchSuggestion = {
      userId: row.accountId,
      slug: row.account.profileSlug,
      name: row.account.displayName,
      avatarUrl: row.account.avatar,
      role: row.creatorRoles[0] as CreatorRole,
      genre,
      affinityScore,
      reason: fragments.slice(0, 2).join(' · '),
    };
    return { item, trendingScore: row.trendingScore, createdAt: row.createdAt };
  }
}

interface Scored {
  item: MatchSuggestion;
  trendingScore: number;
  createdAt: Date;
}

/** score desc, tie-break trendingScore desc, then createdAt asc (directory parity). */
function byScore(a: Scored, b: Scored): number {
  return (
    b.item.affinityScore - a.item.affinityScore ||
    b.trendingScore - a.trendingScore ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/** seekingTargetRole if valid, else the complement of a single declared creator role, else null. */
function derivePreferredRole(viewer: ViewerRow): CreatorRole | null {
  const target = viewer.seekingTargetRole;
  if (target && (CREATOR_ROLES as readonly string[]).includes(target)) return target as CreatorRole;
  if (viewer.creatorRoles.length === 1) {
    return CREATOR_ROLES.find((r) => r !== viewer.creatorRoles[0]) ?? null;
  }
  return null;
}
