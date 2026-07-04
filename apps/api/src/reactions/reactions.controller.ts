import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ReactionStateResponse, ReactionTargetType, ReactionToggleResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ReactionsService } from './reactions.service';
import { ReactionToggleDto } from './dto/reaction-toggle.dto';

/**
 * DR-9 — unified ♥ like / ★ save toggle, cross-cutting over work/chapter/illustration.
 * Authenticated only; strictly owner-scoped via req.accountId (never a client field — BA7).
 */
@Controller('reactions')
@UseGuards(SessionGuard)
export class ReactionsController {
  constructor(private readonly service: ReactionsService) {}

  @Post('like')
  likeOn(@Req() req: AuthRequest, @Body() dto: ReactionToggleDto): Promise<ReactionToggleResponse> {
    return this.service.toggle(req.accountId, 'like', true, dto);
  }

  @Delete('like')
  likeOff(@Req() req: AuthRequest, @Body() dto: ReactionToggleDto): Promise<ReactionToggleResponse> {
    return this.service.toggle(req.accountId, 'like', false, dto);
  }

  @Post('save')
  saveOn(@Req() req: AuthRequest, @Body() dto: ReactionToggleDto): Promise<ReactionToggleResponse> {
    return this.service.toggle(req.accountId, 'save', true, dto);
  }

  @Delete('save')
  saveOff(@Req() req: AuthRequest, @Body() dto: ReactionToggleDto): Promise<ReactionToggleResponse> {
    return this.service.toggle(req.accountId, 'save', false, dto);
  }

  @Get('state')
  getState(
    @Req() req: AuthRequest,
    @Query('targetType') targetType: ReactionTargetType,
    @Query('ids') ids?: string,
  ): Promise<ReactionStateResponse> {
    const idList = ids ? ids.split(',').filter(Boolean) : [];
    return this.service.getState(req.accountId, targetType, idList);
  }
}
