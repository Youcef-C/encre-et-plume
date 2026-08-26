import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { PlancheDto, WorkChaptersResponse, WorkDetail } from '@encre-et-plume/shared';
import { isWork18Plus } from '@encre-et-plume/shared';
import { WorksService } from './works.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-3 work page "Œuvre" — public, read-only (no auth/guard: anonymous visitors browse freely).
 * `{id}` in the story is the public `slug` — every card in the app already links to `/oeuvre/{slug}`.
 */
@Controller('works')
export class WorksController {
  constructor(
    private readonly worksService: WorksService,
    private readonly ageGate: AgeGateService,
    private readonly blocks: BlocksService,
  ) {}

  // DR-10 BE-6 / H2: OptionalSessionGuard on both routes that expose 18+ artwork (this detail
  // route and `:slug/planches` below) — `:slug/chapters` stays fully public/guard-free.
  @Get(':slug')
  @UseGuards(OptionalSessionGuard)
  async getWork(@Param('slug') slug: string, @Req() req: AuthRequest): Promise<WorkDetail> {
    let work = await this.worksService.getWork(slug);
    if (!work) throw new NotFoundException('Œuvre introuvable');
    // Gate check runs AFTER the (Redis-cached, viewer-agnostic) read — per-viewer state is never cached.
    if (isWork18Plus(work.audienceRating)) {
      await this.ageGate.assertMayView18Plus(req.accountId, req.identityDegraded);
    }
    // MC-10: per-viewer mute/block filtering of the review list — same "never cache per-viewer state"
    // pattern as the age gate. Spread-copy so the shared cached object is never mutated. Rating
    // aggregates stay global (work-level stats, D3). Anonymous viewers get the untouched payload.
    // Round 2 (B11): a blocked-pair work 404s with the route's neutral copy (mutual content-hiding, D8c).
    if (req.accountId) {
      const hidden = await this.blocks.hiddenAuthorIds(req.accountId);
      if (hidden.size) {
        work = { ...work, reviews: work.reviews.filter((r) => !r.authorId || !hidden.has(r.authorId)) };
      }
      const hc = await this.blocks.hiddenContent(req.accountId);
      if (hc?.workIds.has(work.id)) throw new NotFoundException('Œuvre introuvable');
    }
    return work;
  }

  // Round 2 (B11): OptionalSessionGuard so a blocked-pair viewer 404s on this slug too.
  @Get(':slug/chapters')
  @UseGuards(OptionalSessionGuard)
  async getChapters(
    @Param('slug') slug: string,
    @Req() req: AuthRequest,
    @Query('page') page?: string,
  ): Promise<WorkChaptersResponse> {
    if (req.accountId) {
      const hc = await this.blocks.hiddenContent(req.accountId);
      if (hc?.workSlugs.has(slug)) throw new NotFoundException('Œuvre introuvable');
    }
    const result = await this.worksService.getChapters(slug, clampPage(page));
    if (!result) throw new NotFoundException('Œuvre introuvable');
    return result;
  }

  // H2: same OptionalSessionGuard + assertMayView18Plus treatment as the detail route above —
  // this listing exposes the same 18+ artwork.
  @Get(':slug/planches')
  @UseGuards(OptionalSessionGuard)
  async getPlanches(@Param('slug') slug: string, @Req() req: AuthRequest): Promise<PlancheDto[]> {
    if (req.accountId) {
      const hc = await this.blocks.hiddenContent(req.accountId);
      if (hc?.workSlugs.has(slug)) throw new NotFoundException('Œuvre introuvable'); // B11
    }
    const result = await this.worksService.getPlanches(slug);
    if (!result) throw new NotFoundException('Œuvre introuvable');
    const audienceRating = await this.worksService.getAudienceRating(slug);
    if (audienceRating && isWork18Plus(audienceRating)) {
      await this.ageGate.assertMayView18Plus(req.accountId, req.identityDegraded);
    }
    return result;
  }
}

/** Non-numeric or <1 input clamps to 1 — mirrors parse-catalog-query.ts's clampPage. */
function clampPage(value?: string): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
