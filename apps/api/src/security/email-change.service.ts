/**
 * BE-4: EmailChangeService — password-verified email change with token confirmation.
 * Mirrors F-11 EmailVerificationService and F-12 PasswordResetService patterns.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import {
  INVALID_PASSWORD,
  EMAIL_CHANGE_TOKEN_INVALID,
  EMAIL_CHANGE_TOKEN_EXPIRED,
  type ChangeEmailResponse,
  type ConfirmEmailChangeResponse,
} from '@encre-et-plume/shared';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEV_STASH_TTL_S = 3600;

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger(EmailChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {}

  /** Request an email change: verify password, check collision, create token, send verification. */
  async request(
    accountId: string,
    newEmail: string,
    password: string,
  ): Promise<ChangeEmailResponse> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, displayName: true, passwordHash: true },
    });
    if (!account) throw new UnauthorizedException();

    const validPassword = await bcrypt.compare(password, account.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Mot de passe incorrect.',
        error: INVALID_PASSWORD,
      });
    }

    if (newEmail === account.email) {
      throw new BadRequestException({
        statusCode: 400,
        message: "L'adresse e-mail est identique à l'adresse actuelle.",
        error: 'SAME_EMAIL',
      });
    }

    const collision = await this.prisma.account.findUnique({ where: { email: newEmail } });
    if (collision) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Cet e-mail est déjà utilisé.',
        error: 'EMAIL_TAKEN',
      });
    }

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.emailChangeToken.create({
      data: { accountId, newEmail, tokenHash, expiresAt },
    });

    const webOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    const verifyUrl = `${webOrigin}/parametres/confirmer-email?token=${raw}`;

    // ponytail: positive opt-in only (H1) — hermetic e2e seam
    if (process.env['ENABLE_DEV_AUTH_SEAMS'] === 'true') {
      await this.redis.set(`dev-email-change:${newEmail}`, raw, 'EX', DEV_STASH_TTL_S);
    }

    // ponytail: best-effort; token persists, user can re-request
    try {
      await this.emailService.send('email_change_verification', newEmail, {
        displayName: account.displayName,
        verifyUrl,
        newEmail,
      });
    } catch (err: unknown) {
      this.logger.warn(`email_change_verification send failed for accountId=${accountId}: ${(err as Error).message}`);
    }

    // ponytail: AD-10 ActionLog emit('email_change') with ip/userAgent when that service lands

    return { pendingEmail: newEmail };
  }

  /** Confirm an email change via the token link. Atomically commits email + emailVerifiedAt. */
  async confirm(rawToken: string): Promise<ConfirmEmailChangeResponse> {
    const tokenHash = sha256(rawToken);
    const row = await this.prisma.emailChangeToken.findUnique({
      where: { tokenHash },
      include: { account: { select: { email: true, displayName: true } } },
    });

    if (!row || row.consumedAt !== null) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Lien de confirmation invalide ou déjà utilisé.',
        error: EMAIL_CHANGE_TOKEN_INVALID,
      });
    }

    if (row.expiresAt < new Date()) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Lien de confirmation expiré. Recommencez la procédure.',
        error: EMAIL_CHANGE_TOKEN_EXPIRED,
      });
    }

    // TOCTOU guard: re-check newEmail availability at commit time
    const collision = await this.prisma.account.findUnique({ where: { email: row.newEmail } });
    if (collision) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Cet e-mail est déjà utilisé.',
        error: 'EMAIL_TAKEN',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const p = tx as typeof this.prisma;
      // Consume this token
      await p.emailChangeToken.update({ where: { id: row.id }, data: { consumedAt: now } });
      // Invalidate any other outstanding change tokens for this account
      await p.emailChangeToken.updateMany({
        where: { accountId: row.accountId, consumedAt: null },
        data: { consumedAt: now },
      });
      // Commit the new email (emailVerifiedAt = now: the new address is freshly proven)
      await p.account.update({
        where: { id: row.accountId },
        data: { email: row.newEmail, emailVerifiedAt: now },
      });
    });

    // Send notice to the OLD address (best-effort)
    try {
      await this.emailService.send('email_change_notice', row.account.email, {
        displayName: row.account.displayName,
        newEmail: row.newEmail,
      });
    } catch (err: unknown) {
      this.logger.warn(`email_change_notice send failed for accountId=${row.accountId}: ${(err as Error).message}`);
    }

    this.logger.log(`Email changed for accountId=${row.accountId} → ${row.newEmail}`);
    return { emailChanged: true };
  }

  /** Return the pending (unconfirmed, unexpired) newEmail for an account, or null. */
  async pendingEmailFor(accountId: string): Promise<string | null> {
    const row = await (this.prisma.emailChangeToken as unknown as {
      findFirst: (args: object) => Promise<{ newEmail: string } | null>;
    }).findFirst({
      where: { accountId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { newEmail: true },
    });
    return row?.newEmail ?? null;
  }
}
