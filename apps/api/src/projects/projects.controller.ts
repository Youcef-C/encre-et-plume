import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { MyProjectsResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ProjectsService } from './projects.service';
import { parseMyProjectsQuery } from './parse-my-projects-query';

/**
 * CS-1 seam: authenticated GET /projects/mine feeds MC-3's invite project picker (no params →
 * legacy behavior). CS-12 extends the same route: `?scope=all&q=&status=&page=` yields the
 * "Mes projets" dashboard listing (projects + illustration collections).
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('mine')
  mine(@Req() req: AuthRequest, @Query() query: Record<string, unknown>): Promise<MyProjectsResponse> {
    return this.service.getMine(req.accountId, parseMyProjectsQuery(query));
  }
}
