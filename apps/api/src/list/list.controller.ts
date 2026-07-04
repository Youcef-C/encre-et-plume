import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ListItemDto, LikedWorkDto } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ListService } from './list.service';

/**
 * DR-8 "Ma liste & coups de cœur". Authenticated only; strictly owner-scoped via req.accountId
 * (never a client-supplied field) — mirrors DR-11's ReadingHistoryController. Read-only: removing a
 * saved work is DR-9's DELETE /reactions/save (B5 — single unsave implementation, counter-aware).
 */
@Controller('me')
@UseGuards(SessionGuard)
export class ListController {
  constructor(private readonly service: ListService) {}

  @Get('list')
  getList(@Req() req: AuthRequest): Promise<ListItemDto[]> {
    return this.service.getList(req.accountId);
  }

  @Get('likes')
  getLikes(@Req() req: AuthRequest): Promise<LikedWorkDto[]> {
    return this.service.getLikes(req.accountId);
  }
}
