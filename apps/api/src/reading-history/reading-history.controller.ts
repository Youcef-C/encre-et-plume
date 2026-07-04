import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { ReadingHistoryEntry, ReadingHistoryResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ReadingHistoryService } from './reading-history.service';

/**
 * DR-11 reading history & resume. Authenticated only; strictly owner-scoped via req.accountId
 * (never a client-supplied field) — mirrors DR-4's FavoritesController/ReadingProgressController.
 */
@Controller('me/reading-history')
@UseGuards(SessionGuard)
export class ReadingHistoryController {
  constructor(private readonly service: ReadingHistoryService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('page') page?: string): Promise<ReadingHistoryResponse> {
    return this.service.getHistory(req.accountId, clampPage(page));
  }

  @Get(':workSlug')
  async one(@Req() req: AuthRequest, @Param('workSlug') workSlug: string): Promise<ReadingHistoryEntry> {
    const entry = await this.service.getForWork(req.accountId, workSlug);
    if (!entry) throw new NotFoundException('Aucune progression');
    return entry;
  }
}

/** Non-numeric or <1 input clamps to 1 — mirrors works.controller.ts's clampPage (ponytail: too small to share). */
function clampPage(value?: string): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
