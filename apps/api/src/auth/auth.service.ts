import { randomUUID } from 'crypto'; // stdlib — no dep needed
import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs'; // ponytail: pure-JS; no native rebuild on Node version change
import type { AccountSummary, AccountPreferences, ThemePreference } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SlugService } from '../slug/slug.service';
import { MetricsService } from '../observability/metrics.service';
import { EmailVerificationService } from './email-verification.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import { Prisma } from '@prisma/client';
import type { Account } from '@prisma/client';

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

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in accounts.service.ts — a 3-line coercion is cheaper than a shared util that ties auth↔accounts
function readPreferences(raw: unknown): AccountPreferences {
  const theme = (raw as Record<string, unknown> | null | undefined)?.['theme'];
  return { theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system' };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugService: SlugService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async signup(dto: SignupDto): Promise<{ account: AccountSummary; token: string }> {
    // Fast-path check for good UX; the unique constraint below is the actual guarantee.
    const exists = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (exists) throw emailTakenException();

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseSlug = this.slugService.slugify(dto.displayName);

    let account: Account | undefined;
    for (let attempt = 0; account === undefined; attempt++) {
      const profileSlug = await this.slugService.ensureUniqueSlug(baseSlug);
      try {
        account = await this.prisma.account.create({
          data: {
            displayName: dto.displayName,
            email: dto.email,
            passwordHash,
            profileSlug,
            profile: { create: {} }, // BE-9: backing Profile row for F-3
          },
        });
      } catch (err) {
        const target = uniqueViolationTarget(err);
        // Concurrent signup won the race on the same email → same 409 as the pre-check.
        if (target?.includes('email')) throw emailTakenException();
        // Slug collision → recompute against the now-committed row and retry (bounded).
        if (target?.includes('profileSlug') && attempt < SLUG_CREATE_RETRIES) continue;
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

    return { account: this.toSummary(account), token: this.signToken(account.id) };
  }

  async login(dto: LoginDto): Promise<{ account: AccountSummary; token: string }> {
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

    const maxAge = dto.rememberMe ? 30 * 24 * 60 * 60 : undefined; // seconds; undefined → session
    return {
      account: this.toSummary(account),
      token: this.signToken(account.id, maxAge),
    };
  }

  async me(accountId: string): Promise<AccountSummary> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException();
    return this.toSummary(account);
  }

  private signToken(accountId: string, expiresInSecs?: number): string {
    return this.jwt.sign(
      { sub: accountId, jti: randomUUID() },
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
    };
  }
}
