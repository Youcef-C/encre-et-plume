import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import type { ChapterPagesResponse } from '@encre-et-plume/shared';
import { ReaderService } from './reader.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-4 reader "Lecteur" — public, read-only aside from the read-count side effect.
 * DR-10 BE-6: OptionalSessionGuard populates req.accountId when logged-in, so the service can
 * tell a logged-in minor apart from a visitor on 18+ chapters (still never requires auth).
 */
@Controller('works')
export class ReaderController {
  constructor(
    private readonly readerService: ReaderService,
    private readonly blocks: BlocksService,
  ) {}

  @Get(':slug/chapters/:n/pages')
  @UseGuards(OptionalSessionGuard)
  async getPages(
    @Param('slug') slug: string,
    @Param('n') n: string,
    @Req() req: AuthRequest,
  ): Promise<ChapterPagesResponse> {
    // MC-10 round 2 (B11): a blocked-pair work reads as introuvable — this route's own neutral copy.
    if (req.accountId) {
      const hc = await this.blocks.hiddenContent(req.accountId);
      if (hc?.workSlugs.has(slug)) throw new NotFoundException('Chapitre introuvable');
    }
    // F-23 B10: ip + user-agent go no further than the visitor-id hash — neither is ever stored.
    return this.readerService.getPages(slug, Number.parseInt(n, 10), req.accountId, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
      identityDegraded: req.identityDegraded,
    });
  }
}
