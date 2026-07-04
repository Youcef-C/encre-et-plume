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
import type {
  AuthResponse,
  AccountSummary,
  VerifyEmailConfirmResponse,
  RequestPasswordResetResponse,
  ConfirmPasswordResetResponse,
  SignupResponse,
  RequestVerificationEmailResponse,
  TwoFactorRequiredResponse,
} from '@encre-et-plume/shared';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { SessionGuard, type AuthRequest } from './guards/session.guard';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailConfirmDto, RequestVerificationEmailDto } from './dto/verify-email.dto';
import { PasswordResetRequestDto, PasswordResetConfirmDto } from './dto/password-reset.dto';
import { RedisService } from '../redis/redis.service';
import { REMEMBER_ME_MAX_AGE_S } from './session-epoch.constants';

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
// M6: per-IP-only ceiling on login, higher than the per-(ip,email) limit — catches a password
// spray across many accounts from one IP that the composite key never trips.
const LOGIN_IP_LIMIT = 50;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly redis: RedisService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Req() req: AuthRequest,
  ): Promise<SignupResponse> {
    await this.rateLimit(`signup:${req.ip ?? 'unknown'}`);
    const { account } = await this.authService.signup(dto, req.ip); // F-13: pass ip for consent record
    // BE-1 R2: no session at signup — the verification e-mail is the credential
    return { verificationRequired: true, email: account.email };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse | TwoFactorRequiredResponse> {
    // M6: composite (ip,email) key alone lets a spray across many accounts from one IP through
    // uncapped — add a higher, per-IP-only ceiling alongside it.
    await this.rateLimit(`login-ip:${req.ip ?? 'unknown'}`, LOGIN_IP_LIMIT, RL_WINDOW_SECS);
    await this.rateLimit(`login:${req.ip ?? 'unknown'}:${dto.email}`);
    const result = await this.authService.login(dto);
    if ('twoFactorRequired' in result) {
      return result; // no cookie; FE must POST /auth/2fa/verify
    }
    const maxAge = dto.rememberMe ? REMEMBER_ME_MAX_AGE_S * 1000 : undefined; // ms for Express
    this.setCookie(res, result.token, maxAge);
    return { account: result.account };
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

  /**
   * POST /auth/verify-email/request — public; rate-limited per IP + per email; non-enumerating.
   * BE-3 R2: mirrors password-reset/request — always 200, never reveals account existence.
   */
  @Post('verify-email/request')
  @HttpCode(200)
  async requestVerification(
    @Body() dto: RequestVerificationEmailDto,
    @Req() req: AuthRequest,
  ): Promise<RequestVerificationEmailResponse> {
    await this.rateLimit(`verify-req-ip:${req.ip ?? 'unknown'}`, 10, 900);
    await this.rateLimit(`verify-req-email:${dto.email}`, 5, 3600);
    await this.emailVerificationService.requestByEmail(dto.email);
    return { ok: true }; // identical body regardless of account existence
  }

  /**
   * POST /auth/verify-email/confirm — public; token is the credential.
   * BE-4 R2: sets ep_session cookie so the FE enters onboarding directly.
   */
  @Post('verify-email/confirm')
  @HttpCode(200)
  async confirmVerification(
    @Body() dto: VerifyEmailConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyEmailConfirmResponse> {
    const { accountId } = await this.emailVerificationService.confirm(dto.token);
    const token = this.authService.issueSessionToken(accountId);
    this.setCookie(res, token);
    return { emailVerified: true };
  }

  /**
   * GET /auth/verify-email/dev-latest — positive opt-in only; hermetic e2e seam.
   * ponytail: default OFF (H1) — never live unless ENABLE_DEV_AUTH_SEAMS==='true'; lets e2e read
   * token without SMTP.
   */
  @Get('verify-email/dev-latest')
  async devLatestToken(@Query('email') email: string): Promise<{ token: string }> {
    if (process.env['ENABLE_DEV_AUTH_SEAMS'] !== 'true') throw new NotFoundException();
    const token = await this.redis.get(`dev-email-verify:${email}`);
    if (!token) throw new NotFoundException();
    return { token };
  }

  // ── F-12: Password reset endpoints ──────────────────────────────────────────

  /** POST /auth/password-reset/request — public; rate-limited per IP + per email; non-enumerating. */
  @Post('password-reset/request')
  @HttpCode(200)
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
    @Req() req: AuthRequest,
  ): Promise<RequestPasswordResetResponse> {
    await this.rateLimit(`pwreset-req-ip:${req.ip ?? 'unknown'}`, 10, 900);
    await this.rateLimit(`pwreset-req-email:${dto.email}`, 5, 3600);
    await this.passwordResetService.requestReset(dto.email);
    return { ok: true }; // identical body regardless of account existence (AC-B2)
  }

  /** POST /auth/password-reset/confirm — public; token is the credential. */
  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmPasswordReset(
    @Body() dto: PasswordResetConfirmDto,
  ): Promise<ConfirmPasswordResetResponse> {
    await this.passwordResetService.confirm(dto.token, dto.newPassword);
    return { reset: true };
  }

  /**
   * GET /auth/password-reset/dev-latest — positive opt-in only; hermetic e2e seam.
   * ponytail: default OFF (H1) — never live unless ENABLE_DEV_AUTH_SEAMS==='true'.
   */
  @Get('password-reset/dev-latest')
  async devLatestResetToken(@Query('email') email: string): Promise<{ token: string }> {
    if (process.env['ENABLE_DEV_AUTH_SEAMS'] !== 'true') throw new NotFoundException();
    const token = await this.redis.get(`dev-password-reset:${email}`);
    if (!token) throw new NotFoundException();
    return { token };
  }

  private async rateLimit(key: string, limit = RL_LIMIT, windowSecs = RL_WINDOW_SECS): Promise<void> {
    // ponytail: skip in e2e so auth.spec.ts doesn't exhaust the 10/15-min limit across runs.
    // M4: NEVER honor this in production — a stray env var must not disable auth throttling.
    if (process.env['DISABLE_RATE_LIMIT'] === 'true' && process.env['NODE_ENV'] !== 'production') return;

    let count: number;
    try {
      // M3: strict variant — a Redis outage must fail CLOSED (block), not silently disable throttling.
      count = await this.redis.incrOrThrow(`rl:${key}`);
    } catch {
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Service temporairement indisponible. Réessayez plus tard.',
          error: 'RATE_LIMIT_UNAVAILABLE',
        },
        429,
      );
    }
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
