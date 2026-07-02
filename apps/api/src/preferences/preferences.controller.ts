import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { NotificationPreferencesResponse, UnsubscribeResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { NotificationPreferencesService } from './preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';

/** GET /me/notification-preferences, PATCH /me/notification-preferences — authenticated. */
@Controller('me/notification-preferences')
@UseGuards(SessionGuard)
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Get()
  getPreferences(@Req() req: AuthRequest): Promise<NotificationPreferencesResponse> {
    return this.service.getMatrix(req.accountId);
  }

  @Patch()
  updatePreferences(
    @Req() req: AuthRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponse> {
    return this.service.applyChanges(req.accountId, dto.changes);
  }
}

/** POST /unsubscribe — public, no authentication required. */
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Post()
  @HttpCode(200)
  unsubscribe(@Body() dto: UnsubscribeDto): Promise<UnsubscribeResponse> {
    return this.service.unsubscribe(dto.token);
  }
}
