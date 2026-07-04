import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ChapterPagesResponse } from '@encre-et-plume/shared';
import { ReaderService } from './reader.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-4 reader "Lecteur" — public, read-only aside from the read-count side effect.
 * DR-10 BE-6: OptionalSessionGuard populates req.accountId when logged-in, so the service can
 * tell a logged-in minor apart from a visitor on 18+ chapters (still never requires auth).
 */
@Controller('works')
export class ReaderController {
  constructor(private readonly readerService: ReaderService) {}

  @Get(':slug/chapters/:n/pages')
  @UseGuards(OptionalSessionGuard)
  getPages(@Param('slug') slug: string, @Param('n') n: string, @Req() req: AuthRequest): Promise<ChapterPagesResponse> {
    return this.readerService.getPages(slug, Number.parseInt(n, 10), req.accountId);
  }
}
