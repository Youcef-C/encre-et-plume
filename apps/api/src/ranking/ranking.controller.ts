import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { RankingEntry, RankingRow } from '@encre-et-plume/shared';
import { RankingService } from './ranking.service';
import { RANKING_LIMIT } from './ranking.util';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-7 "Classement" ranking — public, read-only (no auth/guard: anonymous visitors browse freely).
 * MC-10 round 2 (B12): drop the blocked pair's works/illustrations for a signed-in member of a
 * blocked pair, post-cache. The `createurs` tab is pointer rows and stays (D9).
 */
@Controller('ranking')
export class RankingController {
  constructor(
    private readonly ranking: RankingService,
    private readonly blocks: BlocksService,
  ) {}

  /** "Tout" = no `genre` query param → no filter. Home sidebar's single-truth all-time works ranking. */
  @Get('all-time')
  @UseGuards(OptionalSessionGuard)
  async allTime(@Req() req: AuthRequest, @Query('genre') genre?: string): Promise<RankingRow[]> {
    const items = await this.ranking.getAllTime(genre, RANKING_LIMIT);
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((w) => !hc.workIds.has(w.id)) : items;
  }

  /** Classement page's 4 category tabs (mangas/romans/illustrations/createurs). Unknown → []. */
  @Get()
  @UseGuards(OptionalSessionGuard)
  async byCategory(@Req() req: AuthRequest, @Query('category') category?: string): Promise<RankingEntry[]> {
    const items = await this.ranking.getByCategory(category, RANKING_LIMIT);
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    if (!hc || category === 'createurs') return items; // createurs = pointer rows (D9)
    const ids = category === 'illustrations' ? hc.illustrationIds : hc.workIds;
    return items.filter((e) => !ids.has(e.id));
  }
}
