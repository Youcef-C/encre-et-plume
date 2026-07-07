import { Injectable } from '@nestjs/common';
import type { MyProjectsResponse, ProjectSummary } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Maps a Project row to the picker summary; meta = "kind · genre · status" (genre omitted when null). */
export function toProjectSummary(p: {
  id: string;
  title: string;
  kind: string;
  genre: string | null;
  status: string;
  cover: string | null;
}): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    meta: [p.kind, p.genre, p.status].filter(Boolean).join(' · '),
    cover: p.cover,
  };
}

/**
 * CS-1 seam. MC-3's invite modal needs the sender's projects for the optional picker, and the
 * POST /invitations ownership check reads the same table. Read-only list here; CS-1 owns creation.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // ponytail: no pagination — owner-scoped picker list, tiny by construction; CS-1 paginates if it grows.
  async getMine(accountId: string): Promise<MyProjectsResponse> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toProjectSummary) };
  }
}
