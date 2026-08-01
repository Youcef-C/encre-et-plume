import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { ChapterDto, ChapterListResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto, UpdateChapterDto } from './dto/chapter.dto';

/**
 * CS-7 project-scoped chapter routes (mirroring `POST /projects/:slug/pages`). Every route is
 * member-gated and every mutation « Écriture »-gated inside ChaptersService.
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Get(':slug/chapters')
  list(@Req() req: AuthRequest, @Param('slug') slug: string): Promise<ChapterListResponse> {
    return this.chapters.list(req.accountId, slug);
  }

  @Post(':slug/chapters')
  create(@Req() req: AuthRequest, @Param('slug') slug: string, @Body() dto: CreateChapterDto): Promise<ChapterDto> {
    return this.chapters.create(req.accountId, slug, dto);
  }
}

/** CS-7 chapter-scoped routes rooted at /chapters (mirroring PagesController at /pages). */
@Controller('chapters')
@UseGuards(SessionGuard)
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateChapterDto): Promise<ChapterDto> {
    return this.chapters.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.chapters.remove(req.accountId, id);
  }
}
