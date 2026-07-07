import { Injectable } from '@nestjs/common';
import type { CallPreview, CallsResponse } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

const CALLS_DEFAULT_LIMIT = 2;
const CALLS_MAX_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// French heading tokens for the "X CHERCHE Y" line (CREATOR_ROLES → uppercase label).
const ROLE_LABEL: Record<string, string> = {
  scenariste: 'SCÉNARISTE',
  dessinateur: 'DESSINATEUR·RICE',
};

/** Lenient limit parse for GET /calls: bad/absent → default 2; clamped to [1, 6] (never errors). */
export function parseCallsLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, CALLS_MAX_LIMIT) : CALLS_DEFAULT_LIMIT;
}

interface CallRow {
  id: string;
  title: string;
  authorRole: string;
  seekingRole: string;
  authorName: string;
  tags: string[];
  closesAt: Date | null;
  applicationCount: number;
}

/**
 * MC-1 "Appels à projets" preview (embedded on "Trouver un·e partenaire"). Read-only, newest open
 * calls. MC-4 owns POST, the full board, board filters/pagination — this module ships only the read.
 */
@Injectable()
export class CallsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenCalls(limit: number): Promise<CallsResponse> {
    const rows = (await this.prisma.projectCall.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as unknown as CallRow[];
    return { items: rows.map(mapPreview) };
  }
}

function mapPreview(row: CallRow): CallPreview {
  const author = ROLE_LABEL[row.authorRole] ?? row.authorRole.toUpperCase();
  const seeking = ROLE_LABEL[row.seekingRole] ?? row.seekingRole.toUpperCase();
  return {
    id: row.id,
    heading: `${author} CHERCHE ${seeking}`,
    title: row.title,
    tags: row.tags,
    authorName: row.authorName,
    closesInDays: row.closesAt ? Math.max(0, Math.ceil((row.closesAt.getTime() - Date.now()) / DAY_MS)) : null,
    applicationCount: row.applicationCount,
  };
}
