import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * Bots, and anything without a user-agent at all (D-4): the day a sitemap ships, an unfiltered
 * crawler makes the visitor count wrong rather than merely noisy.
 */
const BOT_UA = /bot|crawl|spider|preview/i;

/** Pathname only — the query string and the fragment are never stored. */
function cleanPath(path: string | undefined): string | null {
  if (!path) return null;
  return path.split(/[?#]/)[0] || '/';
}

/** Referrer HOST only — never the path a visitor arrived from. */
function refHost(ref: string | undefined): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).host || null;
  } catch {
    return null; // a malformed referrer is not worth a 400 on a fire-and-forget beacon
  }
}

/**
 * F-23 — the cookieless ingest endpoint. Nothing is read from or written to browser storage, so
 * art. 82 is never triggered and no consent banner gates it (`consent.audience` stays deliberately
 * unused). Every step is fail-open: a Redis outage loses the measurement, never the page view.
 */
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** POST /events — public, 204, no body. OptionalSessionGuard attributes it when signed in. */
  @Post('events')
  @UseGuards(OptionalSessionGuard)
  @HttpCode(204)
  async track(@Body() body: TrackEventDto, @Req() req: AuthRequest): Promise<void> {
    const userAgent = req.headers['user-agent'];
    if (!userAgent || BOT_UA.test(userAgent)) return; // still 204 — a bot learns nothing from it

    try {
      await this.analytics.track({
        kind: 'visit', // the browser may emit nothing else; the DTO is what enforces it
        visitorId: await this.analytics.visitorId(req.ip, userAgent),
        accountId: req.accountId ?? null,
        path: cleanPath(body.path),
        ref: refHost(body.ref),
      });
    } catch {
      // Fail-open at the ENDPOINT, not just inside RedisService: whatever breaks downstream, a
      // page view must never become a 500. A lost measurement is the cheapest thing here.
    }
  }
}
