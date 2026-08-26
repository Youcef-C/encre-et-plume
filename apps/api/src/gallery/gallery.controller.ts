import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  GalleryFeatureCard,
  GalleryIllustrationCard,
  GalleryListResponse,
  GalleryPreview,
  IllustrationDetail,
  PublishIllustrationResponse,
} from '@encre-et-plume/shared';
import { GalleryService } from './gallery.service';
import { parseGalleryQuery } from './parse-gallery-query';
import { PublishIllustrationDto } from './dto/publish-illustration.dto';
import { UpdateIllustrationDto } from './dto/update-illustration.dto';
import { AgeGateService } from '../age-gate/age-gate.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-5 illustration gallery "Galerie" — public, read-only (no auth/guard: anonymous visitors
 * browse freely). Bare `@Controller()` (no class-level prefix), same pattern as `CatalogController`.
 * DR-12 (BE-4): `POST /illustrations` (minimal publish) + `GET /illustrations/mine` add the two
 * authenticated creator routes — the interim CS-3 stand-in.
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

  // DR-12 (BE-4): minimal publish. Creator role + collection ownership enforced in the service.
  @Post('illustrations')
  @UseGuards(SessionGuard)
  publish(@Req() req: AuthRequest, @Body() dto: PublishIllustrationDto): Promise<PublishIllustrationResponse> {
    return this.galleryService.publishIllustration(req.accountId, dto);
  }

  // DR-12: the caller's own published illustrations (manage-view add picker). Declared BEFORE the
  // `:id` route so the static `mine` segment isn't shadowed (same trap as `trending`).
  @Get('illustrations/mine')
  @UseGuards(SessionGuard)
  mine(@Req() req: AuthRequest): Promise<GalleryIllustrationCard[]> {
    return this.galleryService.getMineIllustrations(req.accountId);
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
      await this.ageGate.assertMayView18Plus(req.accountId, req.identityDegraded);
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
    // BE-9: pass the viewer so a private piece stays visible to its owner but 404s for everyone else.
    const detail = await this.galleryService.getIllustration(id, req.accountId);
    if (!detail) throw new NotFoundException('Illustration introuvable');
    if (detail.is18plus) {
      await this.ageGate.assertMayView18Plus(req.accountId, req.identityDegraded);
    }
    return detail;
  }

  // BE-9: owner-only partial edit of the illustration itself. PATCH verb → no shadow with the
  // `:id` GET routes. Returns the full IllustrationDetail (the FE commits it directly).
  @Patch('illustrations/:id')
  @UseGuards(SessionGuard)
  update(@Param('id') id: string, @Req() req: AuthRequest, @Body() dto: UpdateIllustrationDto): Promise<IllustrationDetail> {
    return this.galleryService.updateIllustration(req.accountId, id, dto);
  }

  // 2026-07-09: owner-only delete (from the illustration "Modifier" form). Uniform 404 for non-owner.
  @Delete('illustrations/:id')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: AuthRequest): Promise<void> {
    return this.galleryService.deleteIllustration(req.accountId, id);
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
