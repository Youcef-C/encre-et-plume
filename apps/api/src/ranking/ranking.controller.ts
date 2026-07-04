import { Controller, Get, Query } from '@nestjs/common';
import type { RankingRow } from '@encre-et-plume/shared';
import { RankingService } from './ranking.service';
import { RANKING_LIMIT } from './ranking.util';

/** DR-7 "Classement" all-time ranking — public, read-only (no auth/guard: anonymous visitors browse freely). */
@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  /** "Tout" = no `genre` query param → no filter. */
  @Get('all-time')
  allTime(@Query('genre') genre?: string): Promise<RankingRow[]> {
    return this.ranking.getAllTime(genre, RANKING_LIMIT);
  }
}
