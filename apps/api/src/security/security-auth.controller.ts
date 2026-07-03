/**
 * F-18: Public /auth endpoints that belong to SecurityModule concerns
 * (POST /auth/2fa/verify, POST /auth/email-change/confirm, GET /auth/email-change/dev-latest).
 * Kept out of AuthController to break the circular-dep and avoid exporting AuthController.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthResponse, ConfirmEmailChangeResponse } from '@encre-et-plume/shared';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { EmailChangeService } from './email-change.service';
import { TwoFactorService } from './two-factor.service';
import { ConfirmEmailChangeDto, TwoFactorVerifyDto } from './dto/security.dto';

const COOKIE_NAME = 'ep_session';
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env['NODE_ENV'] === 'production',
};

@Controller('auth')
export class SecurityAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly emailChange: EmailChangeService,
    private readonly redis: RedisService,
  ) {}

  /** POST /auth/2fa/verify — complete a 2FA challenge; sets the session cookie on success. */
  @Post('2fa/verify')
  @HttpCode(200)
  async twoFactorVerify(
    @Body() dto: TwoFactorVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { accountId, rememberMe } = await this.twoFactor.verifyChallenge(dto.challengeToken, dto.code);
    const { account, token } = await this.authService.loginByAccountId(accountId, rememberMe);
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined;
    res.cookie(COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, ...(maxAge ? { maxAge } : {}) });
    return { account };
  }

  /** POST /auth/email-change/confirm — public; token is the credential. */
  @Post('email-change/confirm')
  @HttpCode(200)
  async confirmEmailChange(@Body() dto: ConfirmEmailChangeDto): Promise<ConfirmEmailChangeResponse> {
    await this.emailChange.confirm(dto.token);
    return { emailChanged: true };
  }

  /**
   * GET /auth/email-change/dev-latest — non-prod e2e seam.
   * ponytail: non-prod test seam ONLY — mirrors /auth/verify-email/dev-latest pattern.
   */
  @Get('email-change/dev-latest')
  async devLatestEmailChangeToken(@Query('email') email: string): Promise<{ token: string }> {
    if (process.env['NODE_ENV'] === 'production') throw new NotFoundException();
    const token = await this.redis.get(`dev-email-change:${email}`);
    if (!token) throw new NotFoundException();
    return { token };
  }
}
