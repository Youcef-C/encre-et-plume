import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { NotificationItem, UnreadCounts, MarkAllReadResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Req() req: AuthRequest): Promise<NotificationItem[]> {
    return this.service.list(req.accountId);
  }

  @Get('unread-counts')
  async unreadCounts(@Req() req: AuthRequest): Promise<UnreadCounts> {
    // Load role from DB — never trust a client claim (mirrors RolesGuard pattern, BE-7)
    const { role } = await this.prisma.account.findUniqueOrThrow({
      where: { id: req.accountId },
      select: { role: true },
    });
    return this.service.unreadCounts(req.accountId, role);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.markRead(req.accountId, id);
  }

  @Post('read-all')
  markAllRead(@Req() req: AuthRequest): Promise<MarkAllReadResponse> {
    return this.service.markAllRead(req.accountId);
  }
}
