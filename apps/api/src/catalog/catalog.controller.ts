import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { ActiveContest, CatalogResponse, EditorPickItem, TrendingWork } from '@encre-et-plume/shared';
import { CatalogService } from './catalog.service';
import { parseCatalogQuery } from './parse-catalog-query';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-2 catalog "Découvrir" — public, read-only (no auth/guard: anonymous visitors browse freely).
 * Bare `@Controller()` (no class-level prefix) because routes span two base paths (`/catalog*` and
 * `/contests/active`) in one small read-only module — see plan §BE-5.
 *
 * MC-10 round 2 (B12): every list route carries OptionalSessionGuard and post-cache filters the
 * blocked pair's works out for a signed-in member of a blocked pair (never mutating the cached
 * array — `.filter()` returns a new one). `total`/`totalPages` stay GLOBAL (D10).
 */
@Controller()
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly blocks: BlocksService,
  ) {}

  @Get('catalog')
  @UseGuards(OptionalSessionGuard)
  async catalog(@Query() query: Record<string, unknown>, @Req() req: AuthRequest): Promise<CatalogResponse> {
    const res = await this.catalogService.findWorks(parseCatalogQuery(query));
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    if (!hc) return res;
    // total stays global (D10) — a filtered page may render fewer cards.
    return { ...res, items: res.items.filter((w) => !hc.workIds.has(w.id)) };
  }

  @Get('catalog/trending')
  @UseGuards(OptionalSessionGuard)
  async trending(@Req() req: AuthRequest): Promise<TrendingWork[]> {
    const items = await this.catalogService.getTrending();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((w) => !hc.workIds.has(w.id)) : items;
  }

  @Get('catalog/editor-pick')
  @UseGuards(OptionalSessionGuard)
  async editorPick(@Req() req: AuthRequest): Promise<EditorPickItem[]> {
    const items = await this.catalogService.getEditorPicks();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    // EditorPickItem has no work id — filter by slug.
    return hc ? items.filter((p) => !hc.workSlugs.has(p.workSlug)) : items;
  }

  @Get('contests/active')
  activeContest(): Promise<ActiveContest | null> {
    return this.catalogService.getActiveContest();
  }
}
