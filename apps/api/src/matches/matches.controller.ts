import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { MatchSuggestionsResponse } from '@encre-et-plume/shared';
import { MATCH_SUGGESTIONS_DEFAULT_LIMIT, MATCH_SUGGESTIONS_MAX_LIMIT } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MatchesService } from './matches.service';

/** Lenient `limit` parse: bad/absent → default, clamped to [1, max] (never 400 — same as /partners). */
export function parseSuggestionsLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MATCH_SUGGESTIONS_MAX_LIMIT) : MATCH_SUGGESTIONS_DEFAULT_LIMIT;
}

/**
 * MC-2 "Suggestions — par affinité de style & genre". Authenticated read-only: any signed-in account
 * may call (F-2 roles don't gate this read, same as /partners). Scoped to the session accountId —
 * never a client-supplied id. `viewerRole` is accepted-and-ignored (MC-1 round-2 convention: the
 * self-role is server-derived from the session profile, never trusted from the client).
 */
@Controller('matches')
@UseGuards(SessionGuard)
export class MatchesController {
  constructor(private readonly service: MatchesService) {}

  @Get('suggestions')
  suggestions(@Req() req: AuthRequest): Promise<MatchSuggestionsResponse> {
    const limit = parseSuggestionsLimit(req.query['limit']);
    return this.service.getSuggestions(req.accountId, limit);
  }
}
