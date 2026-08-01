import { randomUUID } from 'node:crypto'; // stdlib — the raw INSERT must supply its own id
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ChapterDto,
  ChapterListResponse,
  ChapterPageRef,
  CreateChapterRequest,
  PageFileTag,
  UpdateChapterRequest,
} from '@encre-et-plume/shared';
import { DEFAULT_TARGET_PAGES, PAGE_STAGES, chapterProgressPct } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from './assets.service';
import { isMemberOf } from './projects.service';
import { GROUP_GATE_SELECT, assertCanWrite, hasGroupPermission } from './members.service';

/** A board card at the last `PAGE_STAGES` step counts as done for the derived progress. */
const TERMINAL_STAGE = PAGE_STAGES[PAGE_STAGES.length - 1];

/** R3-4 — retries left for the residual READ COMMITTED overlap the in-statement number can still lose. */
const QUICK_CREATE_ATTEMPTS = 5;

/**
 * The wire may still CARRY a `targetPages: null` (R2-7's "clear the target" body, retired by R3-2),
 * so the service answers with its own French 400 instead of class-validator's shape error.
 */
type CreateChapterBody = Omit<CreateChapterRequest, 'targetPages'> & { targetPages?: number | null };
type UpdateChapterBody = Omit<UpdateChapterRequest, 'targetPages'> & { targetPages?: number | null };

type ProjectRow = {
  id: string;
  ownerId: string;
  visibility: string;
  workId: string;
  work: { creators: { accountId: string; groupRole: string; permissions: string[] }[] } | null;
};

type ChapterRow = {
  id: string;
  workId: string;
  number: number;
  title: string | null;
  resume: string | null;
  status: string;
  likeCount: number;
  targetPages: number;
};

type PageRow = {
  id: string;
  chapterId: string | null;
  title: string;
  stage: string;
  fileTags: string[];
  /** R6-1a — the card's linked `page` asset (at most one: CS-3 keeps dessin/page single-linked). */
  assetLinks: { asset: { mediaId: string } | null }[];
};

const PROJECT_GATE_INCLUDE = { work: { include: { creators: { select: GROUP_GATE_SELECT } } } } as const;

const CHAPTER_SELECT = {
  id: true,
  workId: true,
  number: true,
  title: true,
  resume: true,
  status: true,
  likeCount: true,
  targetPages: true,
} as const;

const PAGE_REF_SELECT = {
  id: true,
  chapterId: true,
  title: true,
  stage: true,
  // R6-1a — the strip draws the card, so the ref carries what the card IS: its tags (`double` → a
  // 2×-wide tile) and its artwork. Joined in the SAME page query — never one lookup per card.
  fileTags: true,
  assetLinks: {
    where: { asset: { type: 'page' as const } },
    select: { asset: { select: { mediaId: true } } },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
  },
} as const;

/**
 * CS-7 "Chapitres" tab — chapter CRUD plus the page-link strip.
 *
 * Every mutation goes through `assertCanWrite` (the CS-10 seam in members.service) — imported, never
 * re-derived: CS-3 and CS-4 each wired a gate per-route and left a sibling caller open. Reads are
 * member-gated with the same 404/403 matrix as the workspace read.
 *
 * `progressPct` and `plancheCount` are DERIVED per request from the linked board cards; the stored
 * `Chapter.plancheCount` / `likeCount` columns belong to the DR reader side and are never written here.
 * `ChapterStatus` (draft|scheduled|published) stays the single status enum — the tab's
 * "en_cours"/"publie" vocabulary is a view-model mapping.
 */
@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    // R6-1b — thumbnails go through CS-3's ONE public/signed resolution (F-10: no bytes from the API).
    private readonly assets: AssetsService,
  ) {}

  // ── GET /projects/:slug/chapters ───────────────────────────────────────────
  async list(accountId: string, slug: string): Promise<ChapterListResponse> {
    const project = await this.loadProjectBySlug(accountId, slug);
    const chapters = (await this.prisma.chapter.findMany({
      where: { workId: project.workId },
      orderBy: { number: 'asc' },
      select: CHAPTER_SELECT,
    })) as unknown as ChapterRow[];

    const pagesByChapter = await this.loadPagesFor(chapters.map((c) => c.id));
    return {
      chapters: chapters.map((c) => toChapterDto(c, project.id, pagesByChapter.get(c.id) ?? [])),
      canWrite: hasGroupPermission(project, accountId, 'ecriture'),
    };
  }

  // ── POST /projects/:slug/chapters ──────────────────────────────────────────
  async create(accountId: string, slug: string, body: CreateChapterBody): Promise<ChapterDto> {
    const project = await this.loadProjectBySlug(accountId, slug);
    assertCanWrite(project, accountId);
    const workId = project.workId;
    const resume = body.resume?.trim() ? body.resume.trim() : null;
    const targetPages = assertTargetPages(body.targetPages);

    // The Chapitres form sends an explicit number — the 409 here IS the F5 collision warning.
    if (body.number !== undefined) {
      const number = assertNumber(body.number);
      await this.assertNumberFree(workId, number, null);
      const chapter = (await this.prisma.chapter.create({
        data: chapterData(workId, assertTitle(body.title ?? ''), number, resume, targetPages),
        select: CHAPTER_SELECT,
      })) as unknown as ChapterRow;
      return toChapterDto(chapter, project.id, []);
    }

    // R2-2 quick-create (the Tableau "＋" chip): the number is assigned SERVER-SIDE.
    //
    // R3-4 — round 2 read `max` first, then inserted. Past ~5 simultaneous clicks the retry cap was
    // exhausted and a raw Prisma error escaped as an unhandled 500 (QA measured 3/10 at 10 concurrent).
    // Two changes close it, and the second one is NOT optional:
    //  1. the number is computed INSIDE the insert (`SELECT COALESCE(MAX(number),0)+1`), so there is
    //     no read-then-write window in application code;
    //  2. the work row is locked `FOR UPDATE` first. Measured against the local DB: (1) alone still
    //     lost 1/8, 3/16 and 12/25, because under READ COMMITTED every concurrent statement reads the
    //     SAME committed max. With the lock: 25/25 distinct in 36 ms.
    // `@@unique([workId, number])` stays the backstop (the explicit-number path takes no lock), a
    // retry absorbs that residue, and an exhausted retry is a mapped 503 — a button click must never
    // produce a 500.
    const title = body.title?.trim() ? body.title.trim() : null;
    for (let attempt = 0; ; attempt++) {
      try {
        const chapter = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "Work" WHERE id = ${workId} FOR UPDATE`;
          const rows = (await tx.$queryRaw`
            INSERT INTO "Chapter" ("id", "workId", "number", "title", "resume", "targetPages", "status")
            SELECT ${randomUUID()}, ${workId}, next.n,
                   COALESCE(${title}::text, 'Chapitre ' || next.n), ${resume}::text,
                   ${targetPages}::int, 'draft'::"ChapterStatus"
            FROM (SELECT COALESCE(MAX("number"), 0) + 1 AS n FROM "Chapter" WHERE "workId" = ${workId}) next
            RETURNING "id", "workId", "number", "title", "resume", "status", "likeCount", "targetPages"
          `) as unknown as ChapterRow[];
          return rows[0];
        });
        return toChapterDto(chapter, project.id, []);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        if (attempt >= QUICK_CREATE_ATTEMPTS - 1) {
          throw new ServiceUnavailableException('Trop de créations simultanées. Réessayez.');
        }
      }
    }
  }

  // ── PATCH /chapters/:id ────────────────────────────────────────────────────
  async update(accountId: string, chapterId: string, body: UpdateChapterBody): Promise<ChapterDto> {
    const { chapter, project } = await this.loadWritableChapter(accountId, chapterId);

    const data: { title?: string; number?: number; resume?: string | null; targetPages?: number } = {};
    if (body.title !== undefined) data.title = assertTitle(body.title);
    if (body.number !== undefined) {
      data.number = assertNumber(body.number);
      await this.assertNumberFree(chapter.workId, data.number, chapter.id);
    }
    if (body.resume !== undefined) data.resume = body.resume.trim() ? body.resume.trim() : null;
    // R3-2: the planned length can no longer be cleared — `null` is a 400, like any non-positive value.
    if (body.targetPages !== undefined) data.targetPages = assertTargetPages(body.targetPages);

    const updated =
      Object.keys(data).length > 0
        ? ((await this.prisma.chapter.update({ where: { id: chapterId }, data, select: CHAPTER_SELECT })) as unknown as ChapterRow)
        : chapter;
    const pages = await this.loadPagesFor([chapterId]);
    return toChapterDto(updated, project.id, pages.get(chapterId) ?? []);
  }

  // ── DELETE /chapters/:id ───────────────────────────────────────────────────
  async remove(accountId: string, chapterId: string): Promise<void> {
    const { chapter } = await this.loadWritableChapter(accountId, chapterId);
    if (chapter.status === 'published') {
      throw new ConflictException('Un chapitre publié ne peut pas être supprimé. Dépubliez-le d’abord.');
    }
    // R2-6: never destroy a member's cards as a side effect of deleting a chapter, and never orphan
    // them either (R2-1d forbids a chapterless card). The user empties the chapter first — moving
    // the cards to another chapter (R2-5) or deleting them.
    const held = await this.prisma.page.count({ where: { chapterId } });
    if (held > 0) {
      throw new ConflictException(
        `Ce chapitre contient ${held} carte${held > 1 ? 's' : ''} — déplacez-les ou supprimez-les d’abord.`,
      );
    }
    await this.prisma.chapter.delete({ where: { id: chapterId } });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Same 404/403 matrix as the workspace read: unknown → 404, non-member public → 403, private → 404. */
  private async loadProjectBySlug(accountId: string, slug: string): Promise<ProjectRow> {
    const project = (await this.prisma.project.findUnique({
      where: { slug },
      include: PROJECT_GATE_INCLUDE,
    })) as unknown as ProjectRow | null;
    if (!project) throw new NotFoundException('Projet introuvable');
    assertMember(project, accountId);
    return project;
  }

  /** WRITE resolver — chapter + its project, membership AND « Écriture », enforced HERE not per-route. */
  private async loadWritableChapter(accountId: string, chapterId: string): Promise<{ chapter: ChapterRow; project: ProjectRow }> {
    const chapter = (await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: CHAPTER_SELECT,
    })) as unknown as ChapterRow | null;
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    const project = (await this.prisma.project.findFirst({
      where: { workId: chapter.workId },
      include: PROJECT_GATE_INCLUDE,
    })) as unknown as ProjectRow | null;
    if (!project) throw new NotFoundException('Chapitre introuvable');
    assertMember(project, accountId);
    assertCanWrite(project, accountId);
    return { chapter, project };
  }

  /** B5 — one number per project. `exceptId` lets a chapter keep its own number on PATCH. */
  private async assertNumberFree(workId: string, number: number, exceptId: string | null): Promise<void> {
    const clash = (await this.prisma.chapter.findFirst({
      where: { workId, number },
      select: { id: true },
    })) as { id: string } | null;
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(`Le numéro ${number} est déjà utilisé par un autre chapitre.`);
    }
  }

  /**
   * One query for every chapter's linked cards — grouped in memory, never one query per chapter.
   * R6-1a adds a SECOND fixed query (thumbnails for every linked page asset, batched by media id),
   * so the whole strip costs 2 queries whatever the number of chapters or cards.
   */
  private async loadPagesFor(chapterIds: string[]): Promise<Map<string, ChapterPageRef[]>> {
    const byChapter = new Map<string, ChapterPageRef[]>();
    if (chapterIds.length === 0) return byChapter;
    const rows = (await this.prisma.page.findMany({
      where: { chapterId: { in: chapterIds } },
      orderBy: { createdAt: 'asc' }, // ordering WITHIN a chapter is CS-6's job
      select: PAGE_REF_SELECT,
    })) as unknown as PageRow[];

    const mediaIds = rows.map(pageMediaId).filter((id): id is string => id !== null);
    const thumbs = mediaIds.length > 0 ? await this.assets.thumbnailUrlsByMediaId(mediaIds) : new Map();

    for (const row of rows) {
      if (!row.chapterId) continue;
      const list = byChapter.get(row.chapterId) ?? [];
      list.push(toPageRef(row, thumbs));
      byChapter.set(row.chapterId, list);
    }
    return byChapter;
  }
}

/** A chapter authored in the studio starts as a draft — publishing is PUB-1's job (the column default
 *  is `published` because DR-3 seeds reader chapters). */
function chapterData(workId: string, title: string, number: number, resume: string | null, targetPages: number) {
  return { workId, title, number, resume, targetPages, status: 'draft' as const };
}

/**
 * « planches prévues »: a positive integer. R3-2 — omitted means the standard 20, and an explicit
 * `null` (R2-7's retired "clear the target") is a 400: the column is NOT NULL, there is nothing to
 * clear to.
 */
function assertTargetPages(value: number | null | undefined): number {
  if (value === undefined) return DEFAULT_TARGET_PAGES;
  if (value === null || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException('Le nombre de planches prévues doit être un entier positif.');
  }
  return value;
}

/**
 * A `(workId, number)` collision, however Prisma chose to report it. Duck-typed so the service keeps
 * no Prisma namespace import.
 *
 * The ORM path raises **P2002**; a RAW query (R3-4's quick-create insert) raises **P2010** and hides
 * the real cause in `meta.code` as the Postgres SQLSTATE **23505** (verified live). Matching only
 * P2002 would rethrow every residual collision as the 500 R3-4 exists to remove.
 */
function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, meta } = e as { code?: string; meta?: { code?: string } };
  return code === 'P2002' || (code === 'P2010' && meta?.code === '23505');
}

function assertMember(project: ProjectRow, accountId: string): void {
  if (isMemberOf(project as never, accountId)) return;
  // A public project tells the caller it exists; a private one must not leak.
  throw new NotFoundException('Projet introuvable');
}

function assertTitle(title: string): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed) throw new BadRequestException('Le titre du chapitre est obligatoire.');
  return trimmed;
}

function assertNumber(number: number): number {
  if (!Number.isInteger(number) || number < 0) {
    throw new BadRequestException('Le numéro du chapitre doit être un entier positif.');
  }
  return number;
}

/** The media backing a card's linked `page` asset, or null when it links none. */
function pageMediaId(p: PageRow): string | null {
  return p.assetLinks?.[0]?.asset?.mediaId ?? null;
}

function toPageRef(p: PageRow, thumbs: Map<string, string | null>): ChapterPageRef {
  const mediaId = pageMediaId(p);
  return {
    id: p.id,
    title: p.title,
    stage: p.stage,
    thumbnailUrl: mediaId ? (thumbs.get(mediaId) ?? null) : null,
    fileTags: (p.fileTags ?? []) as PageFileTag[],
  };
}

function toChapterDto(c: ChapterRow, projectId: string, pages: ChapterPageRef[]): ChapterDto {
  const done = pages.filter((p) => p.stage === TERMINAL_STAGE).length;
  // R2-7/R3-2: progress is done ÷ PLANNED length, through the ONE shared formula the kanban board
  // also uses (R3-3), so the server value and the board's local recomputation cannot drift.
  const progressPct = chapterProgressPct(done, c.targetPages);
  return {
    id: c.id,
    projectId,
    title: c.title,
    number: c.number,
    resume: c.resume,
    status: c.status === 'published' ? 'publie' : 'en_cours',
    progressPct,
    targetPages: c.targetPages,
    plancheCount: pages.length,
    likeCount: c.likeCount,
    pages,
  };
}
