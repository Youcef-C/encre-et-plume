import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { PageDetailResponse, PageVersionItem, WorkspacePage } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { PagesService } from './pages.service';
import { UpdatePageDto, UpdatePageStageDto } from './dto/page.dto';

/**
 * CS-2 kanban card routes rooted at /pages (the story's paths split roots: card creation lives on
 * ProjectsController's `POST /projects/:slug/pages`). All routes are member-gated in PagesService.
 */
@Controller('pages')
@UseGuards(SessionGuard)
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdatePageDto): Promise<WorkspacePage> {
    return this.pages.updatePage(req.accountId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.pages.deletePage(req.accountId, id);
  }

  @Patch(':id/stage')
  stage(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdatePageStageDto): Promise<WorkspacePage> {
    return this.pages.updateStage(req.accountId, id, dto);
  }

  @Get(':id/versions')
  versions(@Req() req: AuthRequest, @Param('id') id: string): Promise<PageVersionItem[]> {
    return this.pages.getVersions(req.accountId, id);
  }

  // Declared AFTER :id/versions — distinct segment counts, no route conflict.
  @Get(':id')
  detail(@Req() req: AuthRequest, @Param('id') id: string): Promise<PageDetailResponse> {
    return this.pages.getDetail(req.accountId, id);
  }
}
