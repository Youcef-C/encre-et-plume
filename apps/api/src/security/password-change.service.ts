/**
 * BE-5: PasswordChangeService — current-password-verified credential change.
 * Invalidates all OTHER sessions (rotateOtherSessions) so the caller stays logged in.
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { INVALID_PASSWORD } from '@encre-et-plume/shared';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class PasswordChangeService {
  private readonly logger = new Logger(PasswordChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Change the account's password. Returns a fresh token so the controller can rotate the cookie
   * while all OTHER sessions are invalidated.
   */
  async change(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ token: string; jti?: string }> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, displayName: true, passwordHash: true },
    });
    if (!account) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Mot de passe actuel incorrect.',
        error: INVALID_PASSWORD,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.account.update({ where: { id: accountId }, data: { passwordHash } });

    // Invalidate all other sessions; re-issue a fresh token for the current session.
    const { token, jti } = await this.authService.rotateOtherSessions(accountId);

    // ponytail: best-effort; credential already updated
    try {
      await this.emailService.send('password_changed', account.email, {
        displayName: account.displayName,
      });
    } catch (err: unknown) {
      this.logger.warn(`password_changed notice failed for accountId=${accountId}: ${(err as Error).message}`);
    }

    // ponytail: AD-10 ActionLog emit('password_change') with ip/userAgent when that service lands

    return { token, jti };
  }
}
