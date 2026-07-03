import { Controller, Get, Query } from '@nestjs/common';
import type { ActiveContest, CatalogResponse, EditorPickItem, TrendingWork } from '@encre-et-plume/shared';
import { CatalogService } from './catalog.service';
import { parseCatalogQuery } from './parse-catalog-query';

/**
 * DR-2 catalog "Découvrir" — public, read-only (no auth/guard: anonymous visitors browse freely).
 * Bare `@Controller()` (no class-level prefix) because routes span two base paths (`/catalog*` and
 * `/contests/active`) in one small read-only module — see plan §BE-5.
 */
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('catalog')
  catalog(@Query() query: Record<string, unknown>): Promise<CatalogResponse> {
    return this.catalogService.findWorks(parseCatalogQuery(query));
  }

  @Get('catalog/trending')
  trending(): Promise<TrendingWork[]> {
    return this.catalogService.getTrending();
  }

  @Get('catalog/editor-pick')
  editorPick(): Promise<EditorPickItem[]> {
    return this.catalogService.getEditorPicks();
  }

  @Get('contests/active')
  activeContest(): Promise<ActiveContest | null> {
    return this.catalogService.getActiveContest();
  }
}
