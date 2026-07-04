import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { PlancheDto, WorkChaptersResponse, WorkDetail } from '@encre-et-plume/shared';
import { isWork18Plus } from '@encre-et-plume/shared';
import { WorksService } from './works.service';
import { AgeGateService } from '../age-gate/age-gate.service';
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
  ) {}

  // DR-10 BE-6: OptionalSessionGuard only on the detail route (the one that hard-gates 18+
  // content) — chapters/planches listings stay fully public/guard-free.
  @Get(':slug')
  @UseGuards(OptionalSessionGuard)
  async getWork(@Param('slug') slug: string, @Req() req: AuthRequest): Promise<WorkDetail> {
    const work = await this.worksService.getWork(slug);
    if (!work) throw new NotFoundException('Œuvre introuvable');
    // Gate check runs AFTER the (Redis-cached, viewer-agnostic) read — per-viewer state is never cached.
    if (isWork18Plus(work.audienceRating)) {
      await this.ageGate.assertMayView18Plus(req.accountId);
    }
    return work;
  }

  @Get(':slug/chapters')
  async getChapters(@Param('slug') slug: string, @Query('page') page?: string): Promise<WorkChaptersResponse> {
    const result = await this.worksService.getChapters(slug, clampPage(page));
    if (!result) throw new NotFoundException('Œuvre introuvable');
    return result;
  }

  @Get(':slug/planches')
  async getPlanches(@Param('slug') slug: string): Promise<PlancheDto[]> {
    const result = await this.worksService.getPlanches(slug);
    if (!result) throw new NotFoundException('Œuvre introuvable');
    return result;
  }
}

/** Non-numeric or <1 input clamps to 1 — mirrors parse-catalog-query.ts's clampPage. */
function clampPage(value?: string): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
