import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  MarkReadResponse,
  SalonMembershipResponse,
  SalonMessageDto,
  SalonMessagesPage,
  SalonOnlineResponse,
  SalonSummary,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { SalonService } from './salon.service';
import { SendSalonMessageDto } from './dto/send-salon-message.dto';

function parseLimit(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * MC-11 "Le Comptoir" REST. All routes SessionGuard'd; the viewer is always `req.accountId` (never a
 * client field). Reads are public preview (any authed user); posting requires membership (enforced in
 * SalonService). Realtime delivery + presence is the shared MC-9 WS gateway.
 */
@Controller('salon')
@UseGuards(SessionGuard)
export class SalonController {
  constructor(private readonly service: SalonService) {}

  @Get()
  summary(@Req() req: AuthRequest): Promise<SalonSummary> {
    return this.service.getSummary(req.accountId);
  }

  @Get('messages')
  messages(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<SalonMessagesPage> {
    return this.service.getMessages(req.accountId, { cursor, limit: parseLimit(limit) });
  }

  @Get('online')
  online(@Req() _req: AuthRequest): Promise<SalonOnlineResponse> {
    return this.service.getOnlineUsers();
  }

  @Post('join')
  join(@Req() req: AuthRequest): Promise<SalonMembershipResponse> {
    return this.service.join(req.accountId);
  }

  @Post('leave')
  leave(@Req() req: AuthRequest): Promise<SalonMembershipResponse> {
    return this.service.leave(req.accountId);
  }

  @Post('messages')
  send(@Req() req: AuthRequest, @Body() dto: SendSalonMessageDto): Promise<SalonMessageDto> {
    return this.service.sendMessage(req.accountId, dto);
  }

  @Post('read')
  read(@Req() req: AuthRequest): Promise<MarkReadResponse> {
    return this.service.markRead(req.accountId);
  }
}
