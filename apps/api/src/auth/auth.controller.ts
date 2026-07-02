import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthResponse, AccountSummary, VerifyEmailConfirmResponse } from '@encre-et-plume/shared';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { SessionGuard, type AuthRequest } from './guards/session.guard';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailConfirmDto } from './dto/verify-email.dto';
import { RedisService } from '../redis/redis.service';

const COOKIE_NAME = 'ep_session';
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // ponytail: Secure=false for dev localhost; set Secure=true + SameSite=None for prod
  secure: process.env['NODE_ENV'] === 'production',
};

// Rate limit: 10 attempts per 15-minute window per key (login/signup)
const RL_LIMIT = 10;
const RL_WINDOW_SECS = 900;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly redis: RedisService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    await this.rateLimit(`signup:${req.ip ?? 'unknown'}`);
    const { account, token } = await this.authService.signup(dto);
    this.setCookie(res, token);
    return { account };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    await this.rateLimit(`login:${req.ip ?? 'unknown'}:${dto.email}`);
    const { account, token } = await this.authService.login(dto);
    const maxAge = dto.rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined; // ms for Express
    this.setCookie(res, token, maxAge);
    return { account };
  }

  @UseGuards(SessionGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Denylist the token's jti so it can't be reused even if the cookie is captured
    if (req.jti && req.tokenExp) {
      const ttl = req.tokenExp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await this.redis.set(`denylist:${req.jti}`, '1', 'EX', ttl);
    }
    res.clearCookie(COOKIE_NAME, SESSION_COOKIE_OPTS);
  }

  @UseGuards(SessionGuard)
  @Get('me')
  async me(@Req() req: AuthRequest): Promise<AccountSummary> {
    return this.authService.me(req.accountId);
  }

  // ── F-11: Email verification endpoints ──────────────────────────────────────

  /** POST /auth/verify-email/request — authenticated; rate-limited 1/min + 5/day per account. */
  @UseGuards(SessionGuard)
  @Post('verify-email/request')
  @HttpCode(204)
  async requestVerification(@Req() req: AuthRequest): Promise<void> {
    await this.rateLimit(`verify-req-min:${req.accountId}`, 1, 60);
    await this.rateLimit(`verify-req-day:${req.accountId}`, 5, 86400);
    const account = await this.authService.me(req.accountId);
    await this.emailVerificationService.issueToken({
      id: req.accountId,
      email: account.email,
      displayName: account.displayName,
    });
  }

  /** POST /auth/verify-email/confirm — public; token is the credential. */
  @Post('verify-email/confirm')
  @HttpCode(200)
  async confirmVerification(
    @Body() dto: VerifyEmailConfirmDto,
  ): Promise<VerifyEmailConfirmResponse> {
    await this.emailVerificationService.confirm(dto.token);
    return { emailVerified: true };
  }

  /**
   * GET /auth/verify-email/dev-latest — non-prod only; hermetic e2e seam.
   * ponytail: non-prod test seam ONLY — never exists in prod; lets e2e read token without SMTP.
   */
  @Get('verify-email/dev-latest')
  async devLatestToken(@Query('email') email: string): Promise<{ token: string }> {
    if (process.env['NODE_ENV'] === 'production') throw new NotFoundException();
    const token = await this.redis.get(`dev-email-verify:${email}`);
    if (!token) throw new NotFoundException();
    return { token };
  }

  private async rateLimit(key: string, limit = RL_LIMIT, windowSecs = RL_WINDOW_SECS): Promise<void> {
    // ponytail: skip in e2e so auth.spec.ts doesn't exhaust the 10/15-min limit across runs
    if (process.env['DISABLE_RATE_LIMIT'] === 'true') return;
    const count = await this.redis.incr(`rl:${key}`);
    if (count === 1) await this.redis.expire(`rl:${key}`, windowSecs);
    if (count > limit) {
      throw new HttpException(
        { statusCode: 429, message: 'Trop de tentatives. Réessayez plus tard.', error: 'RATE_LIMITED' },
        429,
      );
    }
  }

  private setCookie(res: Response, token: string, maxAge?: number): void {
    res.cookie(COOKIE_NAME, token, {
      ...SESSION_COOKIE_OPTS,
      ...(maxAge !== undefined ? { maxAge } : {}),
    });
  }
}
