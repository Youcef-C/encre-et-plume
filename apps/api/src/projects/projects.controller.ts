import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { MyProjectsResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ProjectsService } from './projects.service';

/** CS-1 seam: authenticated GET /projects/mine feeds MC-3's invite project picker. */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('mine')
  mine(@Req() req: AuthRequest): Promise<MyProjectsResponse> {
    return this.service.getMine(req.accountId);
  }
}
