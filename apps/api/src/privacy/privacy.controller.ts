import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { DataExportDto, DeleteAccountResponse } from '@encre-et-plume/shared';
import { PrivacyService } from './privacy.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';

const COOKIE_NAME = 'ep_session';
// ponytail: mirrors AuthController SESSION_COOKIE_OPTS
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env['NODE_ENV'] === 'production',
};

@Controller('me')
@UseGuards(SessionGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** POST /me/data-export — authenticated; enqueues a data-export job. */
  @Post('data-export')
  async requestExport(@Req() req: AuthRequest): Promise<DataExportDto> {
    return this.privacy.requestExport(req.accountId);
  }

  /** GET /me/data-export — status + signed download URL when ready. */
  @Get('data-export')
  async getExport(@Req() req: AuthRequest): Promise<DataExportDto> {
    return this.privacy.getExport(req.accountId);
  }

  /** DELETE /me/account — password re-auth; clears session cookie on success. */
  @Delete('account')
  @HttpCode(200)
  async deleteAccount(
    @Body() dto: DeleteAccountDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DeleteAccountResponse> {
    const result = await this.privacy.deleteAccount(req.accountId, dto.password);
    res.clearCookie(COOKIE_NAME, SESSION_COOKIE_OPTS);
    return result;
  }
}
