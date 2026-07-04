import { Controller, Delete, Get, HttpCode, Param, Req, UseGuards } from '@nestjs/common';
import type { ListItemDto, LikedWorkDto } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ListService } from './list.service';

/**
 * DR-8 "Ma liste & coups de cœur". Authenticated only; strictly owner-scoped via req.accountId
 * (never a client-supplied field) — mirrors DR-11's ReadingHistoryController.
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

  @Delete('list/:slug')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('slug') slug: string): Promise<void> {
    return this.service.removeFromList(req.accountId, slug);
  }
}
