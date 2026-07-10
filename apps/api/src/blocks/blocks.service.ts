import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockDto, BlockKind, BlocksResponse, CreateBlockRequest } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

const LIST_CAP = 200; // ponytail: personal list fits (mirrors MC-8 LIST_CAP); paginate if it ever doesn't.

interface BlockRow {
  id: string;
  blockedId: string;
  kind: BlockKind;
  createdAt: Date;
}

interface BlockRowWithAccount extends BlockRow {
  blocked: { id: string; displayName: string; profileSlug: string; avatar: string | null };
}

/**
 * The one struct every content surface consumes (works/reader/catalog/home/ranking/gallery).
 * API-internal (never crosses to the FE), so it stays here, not in packages/shared.
 */
export interface HiddenContent {
  accountIds: Set<string>; // blocked-pair accounts, EITHER direction, kind='block' only
  workIds: Set<string>; // works with ANY blocked-pair creator (WorkCreator.accountId)
  workSlugs: Set<string>; // same works by slug (editor picks, slug-routed detail/chapters/planches/reader)
  illustrationIds: Set<string>; // Illustration.artistId ∈ accountIds
}

function isP2002(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

function toDto(row: BlockRow): BlockDto {
  return { id: row.id, userId: row.blockedId, kind: row.kind, createdAt: row.createdAt.toISOString() };
}

/**
 * MC-10 "Block & mute". Self-service list under /me/blocks (the blocker is always the session account,
 * never a client field). `block` closes every inbound door (DM/invite/connect/apply) via isBlockedPair
 * and auto-removes the existing connection + pending requests both ways; `mute` is read-filtering only.
 * Blocks are unilateral and invisible to the target (no notification, no existence-leak on remove).
 *
 * PUB-2 seam: when comment reads land, they must filter authors via hiddenAuthorIds(viewerId) — the same
 * per-viewer set the DR-3 review read already consumes (works.controller.ts).
 */
@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(blockerId: string, dto: CreateBlockRequest): Promise<BlockDto> {
    if (dto.userId === blockerId) {
      throw new BadRequestException('Vous ne pouvez pas vous bloquer vous-même.');
    }
    const target = await this.prisma.account.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Ce membre est introuvable.');

    const data = { blockerId, blockedId: dto.userId, kind: dto.kind };
    try {
      if (dto.kind === 'block') {
        // Auto-remove an existing contact/connection AND withdraw pending requests both ways — atomic
        // with the block insert (the pair-where matches either direction and any status).
        const [row] = (await this.prisma.$transaction([
          this.prisma.userBlock.create({ data }),
          this.prisma.connection.deleteMany({
            where: {
              OR: [
                { requesterId: blockerId, addresseeId: dto.userId },
                { requesterId: dto.userId, addresseeId: blockerId },
              ],
            },
          }),
        ])) as unknown as [BlockRow, unknown];
        // ponytail: AD-10 ActionLogService.record('user_blocked') seam (like privacy.service.ts).
        return toDto(row);
      }
      const row = (await this.prisma.userBlock.create({ data })) as unknown as BlockRow;
      // ponytail: AD-10 ActionLogService.record('user_blocked') seam (mute variant).
      return toDto(row);
    } catch (e) {
      // Idempotent: a double-click / re-post of the same (blocker, blocked, kind) returns the existing row.
      if (isP2002(e)) {
        const existing = (await this.prisma.userBlock.findUnique({
          where: { blockerId_blockedId_kind: { blockerId, blockedId: dto.userId, kind: dto.kind } },
        })) as unknown as BlockRow | null;
        if (existing) return toDto(existing);
      }
      throw e;
    }
  }

  async remove(blockerId: string, userId: string, kind: BlockKind): Promise<void> {
    const res = await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId: userId, kind } });
    if (res.count === 0) throw new NotFoundException('Compte introuvable dans vos comptes bloqués.');
    // ponytail: AD-10 ActionLogService.record('user_unblocked') seam.
  }

  async list(blockerId: string): Promise<BlocksResponse> {
    const rows = (await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      take: LIST_CAP,
      include: { blocked: { select: { id: true, displayName: true, profileSlug: true, avatar: true } } },
    })) as unknown as BlockRowWithAccount[];

    return {
      items: rows.map((r) => ({
        userId: r.blocked.id,
        slug: r.blocked.profileSlug,
        name: r.blocked.displayName,
        avatarUrl: r.blocked.avatar,
        kind: r.kind,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Symmetric block check (D4): any `block` row in EITHER direction closes the door for BOTH parties.
   * One call gates DM/invite/connect/apply — enforcement consumers throw each surface's own neutral 404.
   */
  async isBlockedPair(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findFirst({
      where: {
        kind: 'block',
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Per-viewer review-filtering set (R2-B4: symmetric for `block`). Includes the viewer's OWN rows
   * (block + mute) AND reverse `block` rows (someone who blocked the viewer) — a block hides reviews
   * both ways. Reverse `mute` rows are excluded: a mute never hides the muter's reviews from the
   * muted user (mute stays one-directional + undisclosed).
   */
  async hiddenAuthorIds(viewerId: string): Promise<Set<string>> {
    const rows = (await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerId }, // own block + mute
          { blockedId: viewerId, kind: 'block' }, // reverse block ONLY
        ],
      },
      select: { blockerId: true, blockedId: true },
    })) as unknown as { blockerId: string; blockedId: string }[];
    // map each row to the "other" account relative to the viewer
    return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
  }

  /**
   * MC-13 roster/search filter: the set of accountIds in a `block` pair with the viewer, BOTH
   * directions. Block-kind-only — mutes must NOT hide people from the roster/search (a mute is
   * read-filtering for content, not a "can't see this person" door). The first query of
   * `hiddenContent` without the work/illustration follow-ups.
   */
  async blockedPairIds(viewerId: string): Promise<Set<string>> {
    const rows = (await this.prisma.userBlock.findMany({
      where: { kind: 'block', OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    })) as unknown as { blockerId: string; blockedId: string }[];
    return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
  }

  /**
   * Directional block flags for the profile read (R2-B1, kind=`block` only). Both false when no block
   * row joins the pair. Consumed by ProfilesService for viewerHasBlocked / blockedByTarget.
   */
  async pairFlags(
    viewerId: string,
    targetId: string,
  ): Promise<{ viewerHasBlocked: boolean; blockedByTarget: boolean }> {
    const rows = (await this.prisma.userBlock.findMany({
      where: {
        kind: 'block',
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    })) as unknown as { blockerId: string }[];
    return {
      viewerHasBlocked: rows.some((r) => r.blockerId === viewerId),
      blockedByTarget: rows.some((r) => r.blockerId === targetId),
    };
  }

  /**
   * Mutual content-hiding set (B9) — the single helper every content surface consumes to drop a
   * blocked pair's works/chapters/planches/reader + catalog/home/ranking + gallery. `null` fast path
   * when the viewer has NO block rows: the overwhelming majority of requests pay zero follow-up
   * queries (consumers do `if (!hc) return unchanged`). A co-created work is hidden ENTIRELY if any
   * creator is in the pair set (conservative for a harassment feature).
   * ponytail: ≤3 queries per request, only for viewers with block rows; Redis-cache per viewer if it
   * ever shows in RED metrics.
   */
  async hiddenContent(viewerId: string): Promise<HiddenContent | null> {
    const rows = (await this.prisma.userBlock.findMany({
      where: { kind: 'block', OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    })) as unknown as { blockerId: string; blockedId: string }[];
    if (rows.length === 0) return null; // fast path — no blocks, no work

    const accountIds = new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
    const ids = [...accountIds];
    const [creators, illos] = (await Promise.all([
      this.prisma.workCreator.findMany({
        where: { accountId: { in: ids } },
        select: { work: { select: { id: true, slug: true } } },
      }),
      this.prisma.illustration.findMany({ where: { artistId: { in: ids } }, select: { id: true } }),
    ])) as unknown as [{ work: { id: string; slug: string } }[], { id: string }[]];

    const workIds = new Set<string>();
    const workSlugs = new Set<string>();
    for (const c of creators) {
      workIds.add(c.work.id);
      workSlugs.add(c.work.slug);
    }
    return { accountIds, workIds, workSlugs, illustrationIds: new Set(illos.map((i) => i.id)) };
  }
}
