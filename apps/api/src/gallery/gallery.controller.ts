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
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-5 illustration gallery "Galerie" — public, read-only (no auth/guard: anonymous visitors
 * browse freely). Bare `@Controller()` (no class-level prefix), same pattern as `CatalogController`.
 * `POST /illustrations` (publish) is intentionally NOT built here — deferred to CS-3 per the plan.
 *
 * MC-10 round 2 (B13): a signed-in member of a blocked pair loses the other party's illustrations —
 * lists filter post-cache (summary counts stay global, D10); detail + preview 404 uniformly.
 */
@Controller()
export class GalleryController {
  constructor(
    private readonly galleryService: GalleryService,
    private readonly ageGate: AgeGateService,
    private readonly blocks: BlocksService,
  ) {}

  @Get('illustrations')
  @UseGuards(OptionalSessionGuard)
  async illustrations(@Query() query: Record<string, unknown>, @Req() req: AuthRequest): Promise<GalleryListResponse> {
    const res = await this.galleryService.findIllustrations(parseGalleryQuery(query));
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    if (!hc) return res;
    // summary counts stay global (D10).
    return { ...res, items: res.items.filter((c) => !hc.illustrationIds.has(c.id)) };
  }

  @Get('illustrations/trending')
  @UseGuards(OptionalSessionGuard)
  async trending(@Req() req: AuthRequest): Promise<GalleryFeatureCard[]> {
    const items = await this.galleryService.getTrending();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((c) => !hc.illustrationIds.has(c.id)) : items;
  }

  // H2: OptionalSessionGuard populates req.accountId when logged-in so the 18+ gate can tell
  // a logged-in minor apart from a visitor — mirrors the `illustration` detail route below.
  @Get('illustrations/:id/preview')
  @UseGuards(OptionalSessionGuard)
  async preview(@Param('id') id: string, @Req() req: AuthRequest): Promise<GalleryPreview> {
    await this.assertNotBlocked(id, req.accountId); // B13: uniform neutral 404 for a blocked pair
    const preview = await this.galleryService.getPreview(id);
    if (preview.is18plus) {
      await this.ageGate.assertMayView18Plus(req.accountId);
    }
    return preview;
  }

  // DR-6: declared after the static `trending` route so `:id` doesn't shadow it (NestJS matches
  // routes in declaration order for same-segment-count paths).
  // DR-10 BE-6: OptionalSessionGuard populates req.accountId when logged-in so the 18+ gate can
  // tell a logged-in minor apart from a visitor.
  @Get('illustrations/:id')
  @UseGuards(OptionalSessionGuard)
  async illustration(@Param('id') id: string, @Req() req: AuthRequest): Promise<IllustrationDetail> {
    await this.assertNotBlocked(id, req.accountId); // B13
    const detail = await this.galleryService.getIllustration(id);
    if (!detail) throw new NotFoundException('Illustration introuvable');
    if (detail.is18plus) {
      await this.ageGate.assertMayView18Plus(req.accountId);
    }
    return detail;
  }

  @Get('illustrations/:id/more')
  @UseGuards(OptionalSessionGuard)
  async more(@Param('id') id: string, @Req() req: AuthRequest): Promise<GalleryIllustrationCard[]> {
    const items = await this.galleryService.getMoreByArtist(id);
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((c) => !hc.illustrationIds.has(c.id)) : items;
  }

  /** B13: a blocked-pair illustration reads as introuvable — same copy as the detail route. */
  private async assertNotBlocked(id: string, accountId?: string): Promise<void> {
    if (!accountId) return;
    const hc = await this.blocks.hiddenContent(accountId);
    if (hc?.illustrationIds.has(id)) throw new NotFoundException('Illustration introuvable');
  }
}
