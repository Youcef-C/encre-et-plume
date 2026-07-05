import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CreateSupportTicketResponse } from '@encre-et-plume/shared';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';
import { RedisService } from '../redis/redis.service';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

// F-21: anti-spam ceiling — 5 messages per IP (and per account) per hour.
const RL_LIMIT = 5;
const RL_WINDOW_SECS = 3600;

/**
 * F-21 support & contact. Submit is PUBLIC (visitors + members) via OptionalSessionGuard —
 * an authenticated cookie binds req.accountId, absence proceeds anonymously. Reading/triage
 * of tickets is AD-14's job; no read endpoint ships here.
 */
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly redis: RedisService,
  ) {}

  @Post('tickets')
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
  async create(
    @Body() dto: CreateSupportTicketDto,
    @Req() req: AuthRequest & { accountId?: string },
  ): Promise<CreateSupportTicketResponse> {
    // 1. Rate-limit per IP, and per account when authenticated.
    await this.rateLimit(`support:${req.ip ?? 'unknown'}`);
    if (req.accountId) await this.rateLimit(`support-acct:${req.accountId}`);

    // 2. Honeypot — generic message, no hint it's a trap.
    if (dto.website) throw new BadRequestException('Requête invalide.');

    // 3. Persist + enqueue (fast path — no inline send).
    await this.support.create(dto, req.accountId);
    return { ok: true };
  }

  // Copied from AuthController.rateLimit — Redis incr fail-CLOSED, e2e escape hatch (never prod).
  private async rateLimit(key: string, limit = RL_LIMIT, windowSecs = RL_WINDOW_SECS): Promise<void> {
    if (process.env['DISABLE_RATE_LIMIT'] === 'true' && process.env['NODE_ENV'] !== 'production') return;

    let count: number;
    try {
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
        { statusCode: 429, message: 'Trop de messages envoyés. Réessayez plus tard.', error: 'RATE_LIMITED' },
        429,
      );
    }
  }
}
