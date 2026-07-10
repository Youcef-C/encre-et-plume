import { BadRequestException } from '@nestjs/common';
import {
  PROJECT_STATUS_FILTERS,
  PROJECT_TYPE_FILTERS,
  PROJECTS_SEARCH_MAX,
  type ProjectStatusFilter,
  type ProjectTypeFilter,
} from '@encre-et-plume/shared';

/** Resolved CS-12 dashboard query — defaults filled so the service never re-checks. */
export interface ParsedMyProjectsQuery {
  scope: 'projects' | 'all';
  q?: string;
  status: ProjectStatusFilter;
  type: ProjectTypeFilter;
  page: number;
}

/**
 * CS-12 · parses/validates GET /projects/mine query params. Default = the legacy MC-3/MC-4 picker
 * behavior (scope='projects', no filters). Mirrors parseCollectionsListQuery: cap `q` (never 400),
 * but an unknown `status` IS a 400 (constrained set, story requirement).
 */
export function parseMyProjectsQuery(raw: Record<string, unknown>): ParsedMyProjectsQuery {
  const scope = raw['scope'] === 'all' ? 'all' : 'projects';

  const rawQ = typeof raw['q'] === 'string' ? raw['q'].trim() : '';
  const q = rawQ === '' ? undefined : rawQ.slice(0, PROJECTS_SEARCH_MAX);

  const status = raw['status'] === undefined ? 'tous' : (raw['status'] as ProjectStatusFilter);
  if (!PROJECT_STATUS_FILTERS.includes(status)) {
    throw new BadRequestException(`Statut inconnu : ${String(raw['status'])}`);
  }

  const type = raw['type'] === undefined ? 'tous' : (raw['type'] as ProjectTypeFilter);
  if (!PROJECT_TYPE_FILTERS.includes(type)) {
    throw new BadRequestException(`Type inconnu : ${String(raw['type'])}`);
  }

  const page = Math.max(1, Math.trunc(Number(raw['page'])) || 1);

  return { scope, q, status, type, page };
}
