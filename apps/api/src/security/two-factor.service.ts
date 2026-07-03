/**
 * BE-6: TwoFactorService — TOTP 2FA lifecycle (setup/confirm/disable/challenge/verify).
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  TWO_FACTOR_ALREADY_ENABLED,
  TWO_FACTOR_NOT_ENABLED,
  TWO_FACTOR_INVALID_CODE,
  TWO_FACTOR_CHALLENGE_INVALID,
  INVALID_PASSWORD,
  type TwoFactorSetupResponse,
  type TwoFactorConfirmResponse,
} from '@encre-et-plume/shared';
import {
  generateSecret,
  buildProvisioningUri,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
} from './totp.util';

/** Max failed code attempts in the window before RATE_LIMITED. */
const RATE_LIMIT = 5;
const RATE_WINDOW_SECS = 15 * 60;
const CHALLENGE_TTL_SECS = 300; // 5 min

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Setup ────────────────────────────────────────────────────────────────────

  /** Generate a pending TOTP credential and return the provisioning URI. */
  async setup(accountId: string, email: string): Promise<TwoFactorSetupResponse> {
    const existing = await this.prisma.twoFactorCredential.findUnique({ where: { accountId } });
    if (existing?.enabledAt) {
      throw new ConflictException({
        statusCode: 409,
        message: 'La double authentification est déjà activée.',
        error: TWO_FACTOR_ALREADY_ENABLED,
      });
    }

    const secret = generateSecret();
    const provisioningUri = buildProvisioningUri(email, secret);
    const secretEncrypted = encryptSecret(secret);

    // Upsert so re-setup overwrites a pending (never confirmed) credential.
    await this.prisma.twoFactorCredential.upsert({
      where: { accountId },
      create: { accountId, secretEncrypted, enabledAt: null, backupCodeHashes: [] },
      update: { secretEncrypted, enabledAt: null, backupCodeHashes: [] },
    });

    return { secret, provisioningUri };
  }

  // ── Confirm ──────────────────────────────────────────────────────────────────

  /** Verify the TOTP code and activate 2FA; returns one-time backup codes. */
  async confirm(accountId: string, code: string): Promise<TwoFactorConfirmResponse> {
    const cred = await this.prisma.twoFactorCredential.findUnique({ where: { accountId } });
    if (!cred) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Aucune configuration 2FA en attente.',
        error: TWO_FACTOR_NOT_ENABLED,
      });
    }

    const secret = decryptSecret(cred.secretEncrypted);
    if (!verifyTotp(secret, code)) {
      // Increment-then-check: if the counter exceeds the limit after this attempt, rate-limit.
      const count = await this.redis.incr(this.rlKey(accountId));
      if (count === 1) await this.redis.expire(this.rlKey(accountId), RATE_WINDOW_SECS);
      if (count > RATE_LIMIT) {
        throw new HttpException(
          { statusCode: 429, message: 'Trop de tentatives. Réessayez dans 15 minutes.', error: 'RATE_LIMITED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Code invalide.',
        error: TWO_FACTOR_INVALID_CODE,
      });
    }

    const { plain, hashes } = generateBackupCodes();
    await this.prisma.twoFactorCredential.update({
      where: { accountId },
      data: { enabledAt: new Date(), backupCodeHashes: hashes },
    });
    // ponytail: AD-10 ActionLog emit('2fa_enabled') with ip/userAgent when that service lands
    await this.redis.del(this.rlKey(accountId));

    return { backupCodes: plain };
  }

  // ── Disable ──────────────────────────────────────────────────────────────────

  /** Disable 2FA. Requires current password AND valid TOTP code (or backup code). */
  async disable(accountId: string, password: string, code: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { passwordHash: true },
    });
    if (!account) throw new UnauthorizedException();

    const pwValid = await bcrypt.compare(password, account.passwordHash);
    if (!pwValid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Mot de passe incorrect.',
        error: INVALID_PASSWORD,
      });
    }

    const cred = await this.prisma.twoFactorCredential.findUnique({ where: { accountId } });
    if (!cred?.enabledAt) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La double authentification n\'est pas activée.',
        error: TWO_FACTOR_NOT_ENABLED,
      });
    }

    const secret = decryptSecret(cred.secretEncrypted);
    const totpValid = verifyTotp(secret, code);
    const backupValid = !totpValid && this.checkBackupCode(code, cred.backupCodeHashes);

    if (!totpValid && !backupValid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Code invalide.',
        error: TWO_FACTOR_INVALID_CODE,
      });
    }

    await this.prisma.twoFactorCredential.delete({ where: { accountId } });
    // ponytail: AD-10 ActionLog emit('2fa_disabled') with ip/userAgent when that service lands
  }

  // ── Challenge ────────────────────────────────────────────────────────────────

  /**
   * Issue a 2FA challenge token (stored in Redis, 5min TTL).
   * Called by AuthService.login() when 2FA is enabled.
   */
  async challenge(accountId: string, rememberMe: boolean): Promise<string> {
    const token = randomUUID();
    await this.redis.set(
      `2fa-challenge:${token}`,
      JSON.stringify({ accountId, rememberMe }),
      'EX',
      CHALLENGE_TTL_SECS,
    );
    return token;
  }

  /**
   * Verify a challenge token + TOTP code. Deletes the token (one-use).
   * Returns accountId + rememberMe on success.
   */
  async verifyChallenge(
    challengeToken: string,
    code: string,
  ): Promise<{ accountId: string; rememberMe: boolean }> {
    const raw = await this.redis.get(`2fa-challenge:${challengeToken}`);
    if (!raw) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Challenge 2FA invalide ou expiré.',
        error: TWO_FACTOR_CHALLENGE_INVALID,
      });
    }

    const { accountId, rememberMe } = JSON.parse(raw) as { accountId: string; rememberMe: boolean };

    const cred = await this.prisma.twoFactorCredential.findUnique({ where: { accountId } });
    if (!cred?.enabledAt) {
      // Stale challenge (2FA was disabled between login and verify); clean up + let through.
      await this.redis.del(`2fa-challenge:${challengeToken}`);
      return { accountId, rememberMe };
    }

    const secret = decryptSecret(cred.secretEncrypted);
    const totpValid = verifyTotp(secret, code);
    const backupValid = !totpValid && this.checkBackupCode(code, cred.backupCodeHashes);

    if (!totpValid && !backupValid) {
      const count = await this.redis.incr(this.rlKey(accountId));
      if (count === 1) await this.redis.expire(this.rlKey(accountId), RATE_WINDOW_SECS);
      if (count > RATE_LIMIT) {
        // Burn the challenge: a throttled attacker must redo the password login to retry.
        await this.redis.del(`2fa-challenge:${challengeToken}`);
        throw new HttpException(
          { statusCode: 429, message: 'Trop de tentatives. Réessayez dans 15 minutes.', error: 'RATE_LIMITED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Code invalide.',
        error: TWO_FACTOR_INVALID_CODE,
      });
    }

    await this.redis.del(`2fa-challenge:${challengeToken}`);
    await this.redis.del(this.rlKey(accountId));

    // Backup code: single-use → remove from hashes.
    if (backupValid) {
      const h = hashBackupCode(code);
      await this.prisma.twoFactorCredential.update({
        where: { accountId },
        data: { backupCodeHashes: cred.backupCodeHashes.filter((x) => x !== h) },
      });
    }

    return { accountId, rememberMe };
  }

  /** Returns true if 2FA is fully enabled for the account. */
  async isEnabled(accountId: string): Promise<boolean> {
    const cred = await this.prisma.twoFactorCredential.findUnique({
      where: { accountId },
      select: { enabledAt: true },
    });
    return cred?.enabledAt != null;
  }

  // ── private ──────────────────────────────────────────────────────────────────

  private checkBackupCode(code: string, hashes: string[]): boolean {
    return hashes.includes(hashBackupCode(code));
  }

  private rlKey(accountId: string): string {
    return `2fa-rl:${accountId}`;
  }
}
