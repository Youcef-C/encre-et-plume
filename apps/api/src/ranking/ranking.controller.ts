import { Controller, Get, Query } from '@nestjs/common';
import type { RankingEntry, RankingRow } from '@encre-et-plume/shared';
import { RankingService } from './ranking.service';
import { RANKING_LIMIT } from './ranking.util';

/** DR-7 "Classement" ranking — public, read-only (no auth/guard: anonymous visitors browse freely). */
@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  /** "Tout" = no `genre` query param → no filter. Home sidebar's single-truth all-time works ranking. */
  @Get('all-time')
  allTime(@Query('genre') genre?: string): Promise<RankingRow[]> {
    return this.ranking.getAllTime(genre, RANKING_LIMIT);
  }

  /** Classement page's 4 category tabs (mangas/romans/illustrations/createurs). Unknown → []. */
  @Get()
  byCategory(@Query('category') category?: string): Promise<RankingEntry[]> {
    return this.ranking.getByCategory(category, RANKING_LIMIT);
  }
}
