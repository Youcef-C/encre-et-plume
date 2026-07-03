/**
 * BE-9: SecurityController — all /me/... security endpoints (F-18).
 * Auth: SessionGuard on all routes.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  ChangeEmailResponse,
  ChangePasswordResponse,
  SessionListResponse,
  SecurityOverviewResponse,
  TwoFactorSetupResponse,
  TwoFactorConfirmResponse,
  TwoFactorDisableResponse,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChangeService } from './email-change.service';
import { PasswordChangeService } from './password-change.service';
import { TwoFactorService } from './two-factor.service';
import { SessionStore } from './session-store.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  TwoFactorConfirmDto,
  TwoFactorDisableDto,
} from './dto/security.dto';

const COOKIE_NAME = 'ep_session';
const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env['NODE_ENV'] === 'production',
};

@Controller('me')
@UseGuards(SessionGuard)
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChange: EmailChangeService,
    private readonly passwordChange: PasswordChangeService,
    private readonly twoFactor: TwoFactorService,
    private readonly sessionStore: SessionStore,
    private readonly authService: AuthService,
  ) {}

  // ── E-mail change ─────────────────────────────────────────────────────────

  /** PATCH /me/email — request an email change; sends verification to newEmail. */
  @Patch('email')
  @HttpCode(202)
  async changeEmail(
    @Req() req: AuthRequest,
    @Body() dto: ChangeEmailDto,
  ): Promise<ChangeEmailResponse> {
    const result = await this.emailChange.request(req.accountId, dto.newEmail, dto.password);
    return result;
  }

  // ── Password change ───────────────────────────────────────────────────────

  /** PATCH /me/password — change password; rotates other sessions; returns fresh cookie. */
  @Patch('password')
  @HttpCode(200)
  async changePassword(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    const { token } = await this.passwordChange.change(
      req.accountId,
      dto.currentPassword,
      dto.newPassword,
    );
    res.cookie(COOKIE_NAME, token, SESSION_COOKIE_OPTS);
    return { ok: true };
  }

  // ── Session management ────────────────────────────────────────────────────

  /** GET /me/sessions — list active sessions. */
  @Get('sessions')
  async listSessions(@Req() req: AuthRequest): Promise<SessionListResponse> {
    // Awaited touch: the guard's fire-and-forget touch loses the race with this read,
    // so the caller's own session would be missing on the first call.
    if (req.jti) {
      await this.sessionStore.touch(
        req.accountId,
        req.jti,
        req.headers['user-agent'] ?? null,
        req.ip ?? null,
      );
    }
    const sessions = await this.sessionStore.list(req.accountId, req.jti ?? '');
    return { sessions };
  }

  /** DELETE /me/sessions/:jti — revoke a specific session. */
  @Delete('sessions/:jti')
  @HttpCode(204)
  async revokeSession(
    @Req() req: AuthRequest,
    @Param('jti') jti: string,
  ): Promise<void> {
    const remaining = req.tokenExp
      ? req.tokenExp - Math.floor(Date.now() / 1000)
      : 7 * 24 * 3600;
    await this.sessionStore.revoke(req.accountId, jti, remaining > 0 ? remaining : 7 * 24 * 3600);
  }

  /** DELETE /me/sessions — revoke ALL other sessions (keep current). */
  @Delete('sessions')
  @HttpCode(204)
  async revokeAllOtherSessions(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Epoch bump kills ALL other sessions, indexed or not (the index is best-effort and
    // can miss sessions that never made an authed request). The caller survives via the
    // reissued cookie — same mechanism as the password-change flow.
    const { token, jti } = await this.authService.rotateOtherSessions(req.accountId);
    res.cookie(COOKIE_NAME, token, SESSION_COOKIE_OPTS);
    await this.sessionStore.reset(req.accountId, jti, {
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });
  }

  // ── 2FA ──────────────────────────────────────────────────────────────────

  /** POST /me/2fa/setup — initiate TOTP setup; returns provisioning URI. */
  @Post('2fa/setup')
  @HttpCode(200)
  async setupTwoFactor(@Req() req: AuthRequest): Promise<TwoFactorSetupResponse> {
    const account = await this.getAccountEmail(req.accountId);
    return this.twoFactor.setup(req.accountId, account.email);
  }

  /** POST /me/2fa/confirm — confirm TOTP code and enable 2FA; returns backup codes. */
  @Post('2fa/confirm')
  @HttpCode(200)
  async confirmTwoFactor(
    @Req() req: AuthRequest,
    @Body() dto: TwoFactorConfirmDto,
  ): Promise<TwoFactorConfirmResponse> {
    return this.twoFactor.confirm(req.accountId, dto.code);
  }

  /** POST /me/2fa/disable — disable 2FA (requires password + code). */
  @Post('2fa/disable')
  @HttpCode(200)
  async disableTwoFactor(
    @Req() req: AuthRequest,
    @Body() dto: TwoFactorDisableDto,
  ): Promise<TwoFactorDisableResponse> {
    await this.twoFactor.disable(req.accountId, dto.password, dto.code);
    return { ok: true };
  }

  // ── Security overview ────────────────────────────────────────────────────

  /** GET /me/security/overview — aggregated security status for the settings page. */
  @Get('security/overview')
  async securityOverview(@Req() req: AuthRequest): Promise<SecurityOverviewResponse> {
    const [twoFactorEnabled, pendingEmail] = await Promise.all([
      this.twoFactor.isEnabled(req.accountId),
      this.emailChange.pendingEmailFor(req.accountId),
    ]);
    return { twoFactorEnabled, pendingEmail };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async getAccountEmail(accountId: string): Promise<{ email: string }> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true },
    });
    if (!account) throw new NotFoundException();
    return account;
  }
}
