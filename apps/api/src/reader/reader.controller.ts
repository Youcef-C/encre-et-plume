import { Controller, Get, Param } from '@nestjs/common';
import type { ChapterPagesResponse } from '@encre-et-plume/shared';
import { ReaderService } from './reader.service';

/** DR-4 reader "Lecteur" — public, read-only aside from the read-count side effect (no guard). */
@Controller('works')
export class ReaderController {
  constructor(private readonly readerService: ReaderService) {}

  @Get(':slug/chapters/:n/pages')
  getPages(@Param('slug') slug: string, @Param('n') n: string): Promise<ChapterPagesResponse> {
    return this.readerService.getPages(slug, Number.parseInt(n, 10));
  }
}
