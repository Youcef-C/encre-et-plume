import { randomUUID } from 'crypto'; // stdlib — no dep needed
import {
  ConflictException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs'; // ponytail: pure-JS; no native rebuild on Node version change
import type { AccountSummary, AccountPreferences, ThemePreference } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SlugService } from '../slug/slug.service';
import { MetricsService } from '../observability/metrics.service';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { Account } from '@prisma/client';

const BCRYPT_ROUNDS = 10;

const VALID_THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

// ponytail: duplicated in accounts.service.ts — a 3-line coercion is cheaper than a shared util that ties auth↔accounts
function readPreferences(raw: unknown): AccountPreferences {
  const theme = (raw as Record<string, unknown> | null | undefined)?.['theme'];
  return { theme: VALID_THEMES.includes(theme as ThemePreference) ? (theme as ThemePreference) : 'system' };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugService: SlugService,
    private readonly jwt: JwtService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async signup(dto: SignupDto): Promise<{ account: AccountSummary; token: string }> {
    const exists = await this.prisma.account.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Cet e-mail est déjà utilisé',
        error: 'EMAIL_TAKEN',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseSlug = this.slugService.slugify(dto.displayName);
    const profileSlug = await this.slugService.ensureUniqueSlug(baseSlug);

    const account = await this.prisma.account.create({
      data: {
        displayName: dto.displayName,
        email: dto.email,
        passwordHash,
        profileSlug,
        profile: { create: {} }, // BE-9: backing Profile row for F-3
      },
    });

    this.metrics?.incSignup(); // F-9: business counter
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
    };
  }
}
