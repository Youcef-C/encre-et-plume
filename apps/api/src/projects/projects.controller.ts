import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  CreateProjectResponse,
  MessageDto,
  MyProjectsResponse,
  ProjectChatPage,
  ProjectWorkspaceResponse,
  UpdateProjectInfoResponse,
  WorkspacePage,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ProjectsService } from './projects.service';
import { PagesService } from './pages.service';
import { ProjectChatService } from './project-chat.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectInfoDto } from './dto/update-project-info.dto';
import { CreatePageDto } from './dto/page.dto';
import { SendProjectMessageDto } from './dto/send-project-message.dto';
import { parseMyProjectsQuery } from './parse-my-projects-query';

/**
 * CS-1 seam: authenticated GET /projects/mine feeds MC-3's invite project picker (no params →
 * legacy behavior). CS-12 extends the same route: `?scope=all&q=&status=&page=` yields the
 * "Mes projets" dashboard listing (projects + illustration collections). CS-1 adds POST /projects
 * (the "Nouveau projet" wizard). CS-2 adds the workspace read/write (`GET`/`PATCH /projects/:slug`)
 * and card creation (`POST /projects/:slug/pages`).
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(
    private readonly service: ProjectsService,
    private readonly pages: PagesService,
    private readonly chat: ProjectChatService,
  ) {}

  // NOTE: '/mine' is declared BEFORE ':slug' so the literal route wins over the param route.
  @Get('mine')
  mine(@Req() req: AuthRequest, @Query() query: Record<string, unknown>): Promise<MyProjectsResponse> {
    return this.service.getMine(req.accountId, parseMyProjectsQuery(query));
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateProjectDto): Promise<CreateProjectResponse> {
    return this.service.create(req.accountId, dto);
  }

  @Get(':slug')
  workspace(@Req() req: AuthRequest, @Param('slug') slug: string): Promise<ProjectWorkspaceResponse> {
    return this.service.getWorkspace(req.accountId, slug);
  }

  @Patch(':slug')
  updateInfo(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Body() dto: UpdateProjectInfoDto,
  ): Promise<UpdateProjectInfoResponse> {
    return this.service.updateInfo(req.accountId, slug, dto);
  }

  @Post(':slug/pages')
  createPage(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Body() dto: CreatePageDto,
  ): Promise<WorkspacePage> {
    return this.pages.createPage(req.accountId, slug, dto);
  }

  // CS-8 « Discussion » — the project's team thread. Member-only (the gate lives in the service);
  // the thread itself is MC-9's conversation reached through `Conversation.projectId`.
  @Get(':slug/messages')
  messages(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<ProjectChatPage> {
    const parsed = Number(limit);
    return this.chat.list(req.accountId, slug, {
      cursor,
      limit: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    });
  }

  @Post(':slug/messages')
  sendMessage(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Body() dto: SendProjectMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(req.accountId, slug, dto);
  }
}
