import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CallCard,
  CallDirection,
  CallFormat,
  CallPreview,
  CallStatus,
  CallsBoardResponse,
  CallsResponse,
} from '@encre-et-plume/shared';
import { CALL_FORMAT_LABELS, CALLS_BOARD_PAGE_SIZE, GENRES } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import type { CreateCallDto } from './dto/create-call.dto';

const CALLS_DEFAULT_LIMIT = 2;
const CALLS_MAX_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// The "X CHERCHE Y" line uses two label sets: the author position ("DESSINATEUR" — no ·RICE),
// the sought position ("DESSINATEUR·RICE"). Verbatim from the story/prototype eyebrows.
const AUTHOR_LABEL: Record<string, string> = { scenariste: 'SCÉNARISTE', dessinateur: 'DESSINATEUR' };
const SOUGHT_LABEL: Record<string, string> = { scenariste: 'SCÉNARISTE', dessinateur: 'DESSINATEUR·RICE' };

// direction ⇄ (authorRole, seekingRole) — bijective with the two stored roles.
const DIRECTION_ROLES: Record<CallDirection, { authorRole: string; seekingRole: string }> = {
  writerSeeksIllustrator: { authorRole: 'scenariste', seekingRole: 'dessinateur' },
  illustratorSeeksWriter: { authorRole: 'dessinateur', seekingRole: 'scenariste' },
};

const GENRE_FR = new Map(GENRES.map((g) => [g.id, g.fr]));

/** Lenient limit parse for the MC-1 preview path: bad/absent → default 2; clamped to [1, 6] (never errors). */
export function parseCallsLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, CALLS_MAX_LIMIT) : CALLS_DEFAULT_LIMIT;
}

export interface CallsBoardQueryParsed {
  role?: string;
  genre?: string[];
  status?: CallStatus | 'all';
  page?: number;
}

interface CallRow {
  id: string;
  title: string;
  authorRole: string;
  seekingRole: string;
  authorId: string | null;
  authorName: string;
  tags: string[];
  description: string;
  genres: string[];
  format: string | null;
  scope: string | null;
  sampleMediaId: string | null;
  closesAt: Date | null;
  applicationCount: number;
  status: string;
  createdAt: Date;
}

function directionOf(authorRole: string): CallDirection {
  return authorRole === 'dessinateur' ? 'illustratorSeeksWriter' : 'writerSeeksIllustrator';
}

function derivedStatus(row: Pick<CallRow, 'status' | 'closesAt'>): CallStatus {
  if (row.status === 'closed') return 'closed';
  if (row.closesAt && row.closesAt.getTime() <= Date.now()) return 'closed';
  return 'open';
}

function heading(authorRole: string, seekingRole: string): string {
  const a = AUTHOR_LABEL[authorRole] ?? authorRole.toUpperCase();
  const s = SOUGHT_LABEL[seekingRole] ?? seekingRole.toUpperCase();
  return `${a} CHERCHE ${s}`;
}

/**
 * MC-1 preview + MC-4 full "Appels à projets" board. Read (preview + filtered/paginated board),
 * create (owner from session), and owner close-early. A row past its `closesAt` is served as
 * `closed` regardless of the stored column (defense-in-depth against auto-close job lag).
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  // ── MC-1 preview (unchanged): newest open calls, limited ─────────────────────
  async findOpenCalls(limit: number): Promise<CallsResponse> {
    const rows = (await this.prisma.projectCall.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as unknown as CallRow[];
    return { items: rows.map(mapPreview) };
  }

  // ── MC-4 board: role / genre / status filters, paginated ─────────────────────
  async findBoard(query: CallsBoardQueryParsed, viewerId: string): Promise<CallsBoardResponse> {
    const page = query.page && query.page >= 1 ? query.page : 1;
    const pageSize = CALLS_BOARD_PAGE_SIZE;
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.projectCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }) as unknown as Promise<CallRow[]>,
      this.prisma.projectCall.count({ where }),
    ]);

    const sampleUrls = await this.resolveSampleUrls(rows);
    return {
      items: rows.map((r) => this.mapCard(r, viewerId, sampleUrls)),
      page,
      pageSize,
      total,
    };
  }

  private buildWhere(query: CallsBoardQueryParsed): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.role) where['seekingRole'] = query.role;
    if (query.genre && query.genre.length > 0) where['genres'] = { hasSome: query.genre };

    const status = query.status ?? 'open';
    const now = new Date();
    if (status === 'open') {
      where['status'] = 'open';
      where['OR'] = [{ closesAt: null }, { closesAt: { gt: now } }];
    } else if (status === 'closed') {
      where['OR'] = [{ status: 'closed' }, { closesAt: { lte: now } }];
    }
    return where;
  }

  // ── MC-4 create: owner = session account ─────────────────────────────────────
  async createCall(viewerId: string, dto: CreateCallDto): Promise<CallCard> {
    const { authorRole, seekingRole } = DIRECTION_ROLES[dto.direction];

    if (dto.sampleMediaId) {
      const media = (await this.prisma.media.findUnique({ where: { id: dto.sampleMediaId } })) as {
        ownerId: string;
        status: string;
        kind: string;
      } | null;
      if (!media || media.ownerId !== viewerId || media.status !== 'ready' || media.kind !== 'call_sample') {
        throw new BadRequestException("Ce visuel d'exemple est invalide.");
      }
    }

    const account = (await this.prisma.account.findUnique({
      where: { id: viewerId },
      select: { displayName: true },
    })) as { displayName: string } | null;

    const tags = composeTags(dto.genres, dto.scope, dto.format);
    const closesAt = new Date(dto.deadline);

    const row = (await this.prisma.projectCall.create({
      data: {
        title: dto.title,
        authorRole,
        seekingRole,
        authorId: viewerId,
        authorName: account?.displayName ?? '',
        tags,
        description: dto.description,
        genres: dto.genres,
        format: dto.format ?? null,
        scope: dto.scope ?? null,
        sampleMediaId: dto.sampleMediaId ?? null,
        closesAt,
        status: 'open',
      },
    })) as unknown as CallRow;

    // Auto-close at the deadline (F-8). Derived-status read (buildWhere/mapCard) covers job lag.
    await this.queue.enqueue(
      'calls',
      'close-call',
      { callId: row.id },
      // BullMQ rejects custom job ids containing ':' ("Custom Id cannot contain :") — hyphens only.
      { delayMs: Math.max(0, closesAt.getTime() - Date.now()), idempotencyKey: `close-call-${row.id}` },
    );

    const sampleUrls = await this.resolveSampleUrls([row]);
    return this.mapCard(row, viewerId, sampleUrls);
  }

  // ── MC-4 owner close-early ───────────────────────────────────────────────────
  async closeEarly(viewerId: string, id: string): Promise<CallCard> {
    const row = (await this.prisma.projectCall.findUnique({ where: { id } })) as unknown as CallRow | null;
    if (!row) throw new NotFoundException('Appel introuvable.');
    if (row.authorId !== viewerId) throw new ForbiddenException('Seul l’auteur peut clôturer cet appel.');

    const updated = (await this.prisma.projectCall.update({
      where: { id },
      data: { status: 'closed' },
    })) as unknown as CallRow;

    const sampleUrls = await this.resolveSampleUrls([updated]);
    return this.mapCard(updated, viewerId, sampleUrls);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private async resolveSampleUrls(rows: CallRow[]): Promise<Map<string, string>> {
    const ids = rows.map((r) => r.sampleMediaId).filter((v): v is string => !!v);
    if (ids.length === 0) return new Map();
    const media = (await this.prisma.media.findMany({
      where: { id: { in: ids }, status: 'ready' },
      select: { id: true, variants: true },
    })) as { id: string; variants: { thumb?: string } | null }[];
    const out = new Map<string, string>();
    for (const m of media) {
      const thumb = m.variants?.thumb;
      if (thumb) out.set(m.id, thumb);
    }
    return out;
  }

  private mapCard(row: CallRow, viewerId: string, sampleUrls: Map<string, string>): CallCard {
    return {
      ...mapPreview(row),
      direction: directionOf(row.authorRole),
      description: row.description,
      sampleUrl: row.sampleMediaId ? sampleUrls.get(row.sampleMediaId) ?? null : null,
      status: derivedStatus(row),
      deadline: row.closesAt ? row.closesAt.toISOString() : null,
      isOwner: !!row.authorId && row.authorId === viewerId,
    };
  }
}

function composeTags(genreIds: string[], scope?: string, format?: CallFormat): string[] {
  const labels = genreIds.map((id) => GENRE_FR.get(id) ?? id);
  if (scope) return [...labels, scope];
  if (format) return [...labels, CALL_FORMAT_LABELS[format]];
  return labels;
}

function mapPreview(row: Pick<CallRow, 'id' | 'authorRole' | 'seekingRole' | 'title' | 'tags' | 'authorName' | 'closesAt' | 'applicationCount'>): CallPreview {
  return {
    id: row.id,
    heading: heading(row.authorRole, row.seekingRole),
    title: row.title,
    tags: row.tags,
    authorName: row.authorName,
    closesInDays: row.closesAt ? Math.max(0, Math.ceil((row.closesAt.getTime() - Date.now()) / DAY_MS)) : null,
    applicationCount: row.applicationCount,
  };
}
