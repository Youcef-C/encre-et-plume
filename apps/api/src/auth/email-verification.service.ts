import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { EMAIL_TOKEN_INVALID, EMAIL_TOKEN_EXPIRED } from '@encre-et-plume/shared';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEV_STASH_TTL_S = 3600;

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {}

  async issueToken(account: { id: string; email: string; displayName: string }): Promise<void> {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: { accountId: account.id, tokenHash, expiresAt },
    });

    const webOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    const verifyUrl = `${webOrigin}/verifier-email?token=${raw}`;

    // ponytail: non-prod only; test seam for hermetic e2e, mirrors a mailhog inbox
    if (process.env['NODE_ENV'] !== 'production') {
      await this.redis.set(`dev-email-verify:${account.email}`, raw, 'EX', DEV_STASH_TTL_S);
    }

    // ponytail: best-effort; row persists, user can resend
    try {
      await this.emailService.send('email_verification', account.email, {
        verifyUrl,
        displayName: account.displayName,
      });
    } catch (err: unknown) {
      this.logger.warn(`Email enqueue failed for accountId=${account.id}: ${(err as Error).message}`);
    }
  }

  /** BE-3: public resend — non-enumerating like PasswordResetService.requestReset. */
  async requestByEmail(email: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
    });
    if (!account || account.emailVerifiedAt !== null) return; // ponytail: non-enumeration — silently return
    await this.issueToken(account);
  }

  async confirm(token: string): Promise<{ accountId: string }> {
    const tokenHash = sha256(token);
    const row = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!row) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token invalide ou déjà utilisé.',
        error: EMAIL_TOKEN_INVALID,
      });
    }

    if (row.consumedAt !== null) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token invalide ou déjà utilisé.',
        error: EMAIL_TOKEN_INVALID,
      });
    }

    if (row.expiresAt < new Date()) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Lien expiré. Demandez un nouvel e-mail de vérification.',
        error: EMAIL_TOKEN_EXPIRED,
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await (tx as typeof this.prisma).emailVerificationToken.update({
        where: { id: row.id },
        data: { consumedAt: now },
      });
      await (tx as typeof this.prisma).account.update({
        where: { id: row.accountId },
        data: { emailVerifiedAt: now },
      });
    });

    // ponytail: AD-10 ActionLog emit('email_verified') here when the service lands
    this.logger.log(`Email verified for accountId=${row.accountId}`);

    return { accountId: row.accountId }; // BE-4 R2: controller uses this to mint the session token
  }
}
