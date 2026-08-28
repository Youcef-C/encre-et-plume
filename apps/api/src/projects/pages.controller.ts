import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { PageDetailResponse, WorkspacePage } from '@encre-et-plume/shared';
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

  // CS-20 — the scenario handoff pin: acknowledge (re-pin to head) and drop it. Both « Écriture »,
  // gated in the service through `loadWritablePage` like every other card write.
  @Post(':id/handoff/acknowledge')
  acknowledgeHandoff(@Req() req: AuthRequest, @Param('id') id: string): Promise<WorkspacePage> {
    return this.pages.acknowledgeHandoff(req.accountId, id);
  }

  @Delete(':id/handoff')
  removeHandoff(@Req() req: AuthRequest, @Param('id') id: string): Promise<WorkspacePage> {
    return this.pages.deleteHandoff(req.accountId, id);
  }

  @Get(':id')
  detail(@Req() req: AuthRequest, @Param('id') id: string): Promise<PageDetailResponse> {
    return this.pages.getDetail(req.accountId, id);
  }
}
