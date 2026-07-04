import { Controller, Get, Param, Query } from '@nestjs/common';
import type { GalleryFeatureCard, GalleryListResponse, GalleryPreview } from '@encre-et-plume/shared';
import { GalleryService } from './gallery.service';
import { parseGalleryQuery } from './parse-gallery-query';

/**
 * DR-5 illustration gallery "Galerie" — public, read-only (no auth/guard: anonymous visitors
 * browse freely). Bare `@Controller()` (no class-level prefix), same pattern as `CatalogController`.
 * `POST /illustrations` (publish) is intentionally NOT built here — deferred to CS-3 per the plan.
 */
@Controller()
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get('illustrations')
  illustrations(@Query() query: Record<string, unknown>): Promise<GalleryListResponse> {
    return this.galleryService.findIllustrations(parseGalleryQuery(query));
  }

  @Get('illustrations/trending')
  trending(): Promise<GalleryFeatureCard[]> {
    return this.galleryService.getTrending();
  }

  @Get('illustrations/:id/preview')
  preview(@Param('id') id: string): Promise<GalleryPreview> {
    return this.galleryService.getPreview(id);
  }
}
