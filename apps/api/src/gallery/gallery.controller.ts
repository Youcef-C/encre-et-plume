import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import type {
  GalleryFeatureCard,
  GalleryIllustrationCard,
  GalleryListResponse,
  GalleryPreview,
  IllustrationDetail,
} from '@encre-et-plume/shared';
import { GalleryService } from './gallery.service';
import { parseGalleryQuery } from './parse-gallery-query';
import { AgeGateService } from '../age-gate/age-gate.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-5 illustration gallery "Galerie" — public, read-only (no auth/guard: anonymous visitors
 * browse freely). Bare `@Controller()` (no class-level prefix), same pattern as `CatalogController`.
 * `POST /illustrations` (publish) is intentionally NOT built here — deferred to CS-3 per the plan.
 */
@Controller()
export class GalleryController {
  constructor(
    private readonly galleryService: GalleryService,
    private readonly ageGate: AgeGateService,
  ) {}

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

  // DR-6: declared after the static `trending` route so `:id` doesn't shadow it (NestJS matches
  // routes in declaration order for same-segment-count paths).
  // DR-10 BE-6: OptionalSessionGuard populates req.accountId when logged-in so the 18+ gate can
  // tell a logged-in minor apart from a visitor.
  @Get('illustrations/:id')
  @UseGuards(OptionalSessionGuard)
  async illustration(@Param('id') id: string, @Req() req: AuthRequest): Promise<IllustrationDetail> {
    const detail = await this.galleryService.getIllustration(id);
    if (!detail) throw new NotFoundException('Illustration introuvable');
    if (detail.is18plus) {
      await this.ageGate.assertMayView18Plus(req.accountId);
    }
    return detail;
  }

  @Get('illustrations/:id/more')
  more(@Param('id') id: string): Promise<GalleryIllustrationCard[]> {
    return this.galleryService.getMoreByArtist(id);
  }
}
