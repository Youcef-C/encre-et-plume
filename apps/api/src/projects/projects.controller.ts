import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { CreateProjectResponse, MyProjectsResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { parseMyProjectsQuery } from './parse-my-projects-query';

/**
 * CS-1 seam: authenticated GET /projects/mine feeds MC-3's invite project picker (no params →
 * legacy behavior). CS-12 extends the same route: `?scope=all&q=&status=&page=` yields the
 * "Mes projets" dashboard listing (projects + illustration collections). CS-1 adds POST /projects
 * (the "Nouveau projet" wizard — authenticated user only, per story authz).
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('mine')
  mine(@Req() req: AuthRequest, @Query() query: Record<string, unknown>): Promise<MyProjectsResponse> {
    return this.service.getMine(req.accountId, parseMyProjectsQuery(query));
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateProjectDto): Promise<CreateProjectResponse> {
    return this.service.create(req.accountId, dto);
  }
}
