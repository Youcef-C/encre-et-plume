import { randomUUID } from 'node:crypto'; // stdlib — no dep needed
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs'; // ponytail: pure-JS; no native rebuild on Node version change
import type { AccountSummary, AccountPreferences, ThemePreference, DmPolicy, TwoFactorRequiredResponse } from '@encre-et-plume/shared';
import { EMAIL_NOT_VERIFIED, deriveIsAdult, DM_POLICIES, DM_POLICY_DEFAULT } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SlugService } from '../slug/slug.service';
import { MetricsService } from '../observability/metrics.service';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../email/email.service';
import { LegalService } from '../legal/legal.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import { Prisma } from '@prisma/client';
import type { Account } from '@prisma/client';
import { REMEMBER_ME_MAX_AGE_S } from './session-epoch.constants';

const BCRYPT_ROUNDS = 10;
// ACID: the DB unique constraints are the real concurrency control for email/slug —
// check-then-insert has a TOCTOU window, so P2002 must be handled, not 500.
const SLUG_CREATE_RETRIES = 3;

/** Columns named in a P2002 unique-constraint violation (target is string[] or string per connector). */
function uniqueViolationTarget(err: unknown): string[] | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = (err.meta as { target?: unknown } | undefined)?.target;
    if (Array.isArray(target)) return target as string[];
    if (typeof target === 'string') return [target];
    return [];
  }
  return undefined;
}

function emailTakenException(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: 'Cet e-mail est déjà utilisé',
    error: 'EMAIL_TAKEN',
  });
}

function usernameTakenException(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: "Ce nom d'utilisateur est déjà pris.",
    error: 'USERNAME_TAKEN',
  });
}

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in accounts.service.ts — a 3-line coercion is cheaper than a shared util that ties auth↔accounts
function readPreferences(raw: unknown): AccountPreferences {
  const obj = raw as Record<string, unknown> | null | undefined;
  const theme = obj?.['theme'];
  const dmPolicy = obj?.['dmPolicy'];
  return {
    theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system',
    dmPolicy: DM_POLICIES.includes(dmPolicy as DmPolicy) ? (dmPolicy as DmPolicy) : DM_POLICY_DEFAULT,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugService: SlugService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationService,
    private readonly legal: LegalService,
    private readonly redisService: RedisService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  async signup(dto: SignupDto, ip?: string): Promise<{ account: AccountSummary }> {
    // Fast-path check for good UX; the unique constraint below is the actual guarantee.
    const exists = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (exists) throw emailTakenException();

    // User-chosen handle (format already DTO-validated) → friendly pre-check, same UX as email.
    const username = dto.username;
    if (username !== undefined) {
      const slugTaken = await this.prisma.account.findUnique({ where: { profileSlug: username } });
      if (slugTaken) throw usernameTakenException();
    }

    // F-13: read current cgu + privacy versions for atomic consent creation
    const cguVersion = await this.legal.currentVersion('cgu');
    const privacyVersion = await this.legal.currentVersion('privacy');
    const consentRows = [
      ...(cguVersion ? [{ document: 'cgu' as const, version: cguVersion, ip }] : []),
      ...(privacyVersion ? [{ document: 'privacy' as const, version: privacyVersion, ip }] : []),
    ];

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseSlug = username ?? this.slugService.slugify(dto.displayName);

    let account: Account | undefined;
    for (let attempt = 0; account === undefined; attempt++) {
      const profileSlug =
        username ?? (await this.slugService.ensureUniqueSlug(baseSlug));
      try {
        account = await this.prisma.account.create({
          data: {
            displayName: dto.displayName,
            email: dto.email,
            passwordHash,
            profileSlug,
            birthdate: new Date(dto.birthdate), // DR-10
            profile: { create: {} }, // BE-9: backing Profile row for F-3
            // F-13: consent rows created atomically with the account (BE-4, BE-5)
            ...(consentRows.length > 0 ? { consents: { create: consentRows } } : {}),
          },
        });
      } catch (err) {
        const target = uniqueViolationTarget(err);
        // Concurrent signup won the race on the same email → same 409 as the pre-check.
        if (target?.includes('email')) throw emailTakenException();
        if (target?.includes('profileSlug')) {
          // A user-CHOSEN handle must never be silently renamed → surface the conflict.
          if (username !== undefined) throw usernameTakenException();
          // Auto-generated slug collision → recompute against the now-committed row and retry (bounded).
          if (attempt < SLUG_CREATE_RETRIES) continue;
        }
        throw err;
      }
    }

    this.metrics?.incSignup(); // F-9: business counter

    // F-11: issue verification token — best-effort; failure must not break signup
    await this.emailVerification
      .issueToken({ id: account.id, email: account.email, displayName: account.displayName })
      .catch((err: unknown) =>
        this.logger.warn(`issueToken failed for accountId=${account.id}: ${(err as Error).message}`),
      );

    // F-16: welcome email — best-effort; mandatory, ponytail: @Optional() EmailService
    if (this.emailService) {
      await this.emailService
        .send('welcome', account.email, { displayName: account.displayName })
        .catch((err: unknown) =>
          this.logger.warn(`welcome email failed for accountId=${account.id}: ${(err as Error).message}`),
        );
    }

    return { account: this.toSummary(account) }; // BE-1 R2: no session at signup; needsCguReconsent defaults false
  }

  /**
   * Optional TwoFactorService injection — set by SecurityModule.
   * Avoids a circular import (SecurityModule needs AuthModule; AuthModule must not import SecurityModule).
   * ponytail: setter injection is the idiomatic NestJS pattern for optional cross-module deps.
   */
  private twoFactorService?: {
    isEnabled(accountId: string): Promise<boolean>;
    challenge(accountId: string, rememberMe: boolean): Promise<string>;
  };

  setTwoFactorService(svc: {
    isEnabled(accountId: string): Promise<boolean>;
    challenge(accountId: string, rememberMe: boolean): Promise<string>;
  }): void {
    this.twoFactorService = svc;
  }

  async login(dto: LoginDto): Promise<{ account: AccountSummary; token: string } | TwoFactorRequiredResponse> {
    const account = await this.prisma.account.findUnique({ where: { email: dto.email } });
    const valid =
      account !== null && (await bcrypt.compare(dto.password, account.passwordHash));

    if (!valid || !account) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Identifiants invalides',
        error: 'INVALID_CREDENTIALS',
      });
    }

    // F-14: reject tombstoned accounts — indistinguishable from wrong password (don't leak deletion)
    const row = account as unknown as Record<string, unknown>;
    if (row['deletedAt'] !== null && row['deletedAt'] !== undefined) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Identifiants invalides',
        error: 'INVALID_CREDENTIALS',
      });
    }

    // BE-2 R2: bcrypt compare runs first (above) so we don't leak which check failed
    if (!account.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Confirmez votre e-mail pour continuer.',
        error: EMAIL_NOT_VERIFIED,
      });
    }

    // F-18: if 2FA is enabled, return a challenge token instead of a session cookie.
    if (this.twoFactorService && await this.twoFactorService.isEnabled(account.id)) {
      const challengeToken = await this.twoFactorService.challenge(account.id, dto.rememberMe ?? false);
      return { twoFactorRequired: true, challengeToken };
    }

    const maxAge = dto.rememberMe ? REMEMBER_ME_MAX_AGE_S : undefined; // seconds; undefined → session
    return {
      account: this.toSummary(account), // needsCguReconsent: false default on login
      token: this.signToken(account.id, maxAge),
    };
  }

  /** BE-4 R2: public seam so AuthController can issue a session token after email confirm. */
  issueSessionToken(accountId: string): string {
    return this.signToken(accountId);
  }

  /** F-18: issue a full session after a successful 2FA challenge. */
  async loginByAccountId(
    accountId: string,
    rememberMe: boolean,
  ): Promise<{ account: AccountSummary; token: string }> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException();
    const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE_S : undefined;
    return { account: this.toSummary(account), token: this.signToken(accountId, maxAge) };
  }

  /**
   * BE-3 / F-18: Bump the session epoch so all pre-existing JWTs are rejected, then issue
   * a fresh token for the caller with ims strictly GREATER than the new epoch (the same-ms
   * hole that existed before ims was added stays closed).
   * The fresh token's jti is returned so the controller can update the session index.
   */
  async rotateOtherSessions(accountId: string): Promise<{ token: string; jti: string }> {
    const epoch = Date.now();
    await this.redisService.set(
      `session-epoch-ms:${accountId}`,
      String(epoch),
      'EX',
      REMEMBER_ME_MAX_AGE_S, // M7: >= max JWT lifetime (rememberMe = 30d)
    );
    const jti = randomUUID();
    const token = this.signToken(accountId, undefined, { ims: epoch + 1, jti });
    return { token, jti };
  }

  async me(accountId: string): Promise<AccountSummary> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException();
    return {
      ...this.toSummary(account),
      needsCguReconsent: await this.legal.needsCguReconsent(accountId), // F-13: live flag
    };
  }

  private signToken(
    accountId: string,
    expiresInSecs?: number,
    overrides?: { ims?: number; jti?: string },
  ): string {
    const jti = overrides?.jti ?? randomUUID();
    return this.jwt.sign(
      // ims = issued-at in MILLISECONDS (custom claim): the standard iat is second-granular,
      // which left a 1s hole in the F-12 session-epoch invalidation. SessionGuard prefers ims.
      { sub: accountId, jti, ims: overrides?.ims ?? Date.now() },
      expiresInSecs !== undefined ? { expiresIn: expiresInSecs } : {},
    );
  }

  private toSummary(account: Account): AccountSummary {
    return {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      role: account.role as AccountSummary['role'],
      verified: account.verified,
      slug: account.profileSlug,
      avatar: account.avatar,
      createdAt: account.createdAt.toISOString(),
      preferences: readPreferences(account.preferences),
      emailVerified: account.emailVerifiedAt !== null, // F-11
      needsCguReconsent: false, // F-13: default for signup/login; me() overrides with live value
      onboarded: account.onboardedAt !== null, // F-17
      isAdult: deriveIsAdult(account.birthdate), // DR-10: derived only — never expose the raw birthdate
    };
  }
}
