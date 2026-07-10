import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreatePageRequest,
  PageStage,
  PageVersionItem,
  UpdatePageRequest,
  UpdatePageStageRequest,
  WorkspacePage,
} from '@encre-et-plume/shared';
import { PAGE_FILE_TAGS, PAGE_STAGES } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isMemberOf } from './projects.service';

const STAGES = new Set<string>(PAGE_STAGES);
const FILE_TAGS = new Set<string>(PAGE_FILE_TAGS);

type PageRow = {
  id: string;
  projectId: string;
  chapterId: string | null;
  title: string;
  stage: PageStage;
  version: number;
  fileTags: string[];
  linkedFileIds: string[];
};

function toWorkspacePage(p: PageRow): WorkspacePage {
  return {
    id: p.id,
    chapterId: p.chapterId,
    title: p.title,
    stage: p.stage,
    version: p.version,
    fileTags: p.fileTags as WorkspacePage['fileTags'],
    linkedFileIds: p.linkedFileIds,
  };
}

/**
 * CS-2 kanban card CRUD + stage transitions. Every route resolves page → project → membership
 * (owner or WorkCreator on the linked Work): unknown id → 404, non-member → 403. Card = `Page`
 * (board card), never `Planche` (reader page). Version bumps on a new file revision; a
 * stage→corrections transition fires the F-5 `project_activity` notification to the other members.
 */
@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPage(accountId: string, slug: string, body: CreatePageRequest): Promise<WorkspacePage> {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: { work: { include: { creators: { select: { accountId: true } } } } },
    });
    if (!project || !project.work) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project, accountId)) throw new ForbiddenException('Réservé aux membres du projet');

    const stage = this.assertStage(body.stage ?? 'scenario');
    const chapterId = body.chapterId ?? null;
    if (chapterId) await this.assertChapterInWork(chapterId, project.workId!);

    const title = body.title?.trim()
      ? body.title.trim()
      : `Page ${(await this.prisma.page.count({ where: { projectId: project.id, chapterId } })) + 1}`;

    const page = await this.prisma.$transaction(async (tx) => {
      const created = await tx.page.create({
        data: { projectId: project.id, chapterId, title, stage, fileTags: [], linkedFileIds: [] },
      });
      await tx.pageVersion.create({ data: { pageId: created.id, version: 1, note: 'Création' } });
      return created;
    });
    return toWorkspacePage(page as PageRow);
  }

  async updatePage(accountId: string, pageId: string, body: UpdatePageRequest): Promise<WorkspacePage> {
    const page = await this.loadMemberPage(accountId, pageId);

    if (body.fileTags && body.fileTags.some((t) => !FILE_TAGS.has(t))) {
      throw new BadRequestException('Type de fichier invalide');
    }
    if (body.chapterId) await this.assertChapterInWork(body.chapterId, page.project.workId!);

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.chapterId !== undefined) data.chapterId = body.chapterId;
    if (body.fileTags !== undefined) data.fileTags = body.fileTags;

    // Version rule: a new/changed linked-file set is "a new file revision" → bump + history row.
    let bumped: number | null = null;
    if (body.linkedFileIds !== undefined) {
      data.linkedFileIds = body.linkedFileIds;
      if (!sameSet(body.linkedFileIds, page.linkedFileIds)) {
        bumped = page.version + 1;
        data.version = bumped;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.page.update({ where: { id: pageId }, data });
      if (bumped !== null) {
        await tx.pageVersion.create({ data: { pageId, version: bumped, note: 'Nouvelle révision de fichier' } });
      }
      return row;
    });
    return toWorkspacePage(updated as PageRow);
  }

  async deletePage(accountId: string, pageId: string): Promise<void> {
    await this.loadMemberPage(accountId, pageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.pageVersion.deleteMany({ where: { pageId } });
      await tx.page.delete({ where: { id: pageId } });
    });
  }

  async updateStage(accountId: string, pageId: string, body: UpdatePageStageRequest): Promise<WorkspacePage> {
    const stage = this.assertStage(body.stage);
    const page = await this.loadMemberPage(accountId, pageId);
    const enteredCorrections = stage === 'corrections' && page.stage !== 'corrections';

    const updated = await this.prisma.page.update({ where: { id: pageId }, data: { stage } });

    // F-5 side effect (best-effort — never fails the request): notify the OTHER members that a page
    // moved into Corrections. Full correction-note flow is CS-5; this is just the required notification.
    if (enteredCorrections) {
      const recipients = new Set<string>([
        page.project.ownerId,
        ...page.project.work.creators.map((c) => c.accountId),
      ]);
      recipients.delete(accountId);
      for (const recipientId of recipients) {
        try {
          await this.notifications.create({
            recipientId,
            type: 'project_activity',
            refId: page.projectId,
            sourceUserId: accountId,
          });
        } catch (e) {
          this.logger.error(`CS-2 corrections notify failed for ${recipientId}: ${(e as Error).message}`);
        }
      }
    }
    return toWorkspacePage(updated as PageRow);
  }

  async getVersions(accountId: string, pageId: string): Promise<PageVersionItem[]> {
    await this.loadMemberPage(accountId, pageId);
    const rows = await this.prisma.pageVersion.findMany({
      where: { pageId },
      orderBy: { version: 'desc' },
    });
    return rows.map((r) => ({ version: r.version, note: r.note, createdAt: r.createdAt.toISOString() }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Load a page with its project membership context; 404 unknown, 403 non-member. */
  private async loadMemberPage(accountId: string, pageId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        project: { include: { work: { include: { creators: { select: { accountId: true } } } } } },
      },
    });
    if (!page) throw new NotFoundException('Carte introuvable');
    if (!isMemberOf(page.project, accountId)) throw new ForbiddenException('Réservé aux membres du projet');
    return page as typeof page & {
      stage: PageStage;
      version: number;
      linkedFileIds: string[];
      project: { ownerId: string; workId: string; work: { creators: { accountId: string }[] } };
    };
  }

  private assertStage(stage: string): PageStage {
    if (!STAGES.has(stage)) throw new BadRequestException('Étape invalide');
    return stage as PageStage;
  }

  private async assertChapterInWork(chapterId: string, workId: string): Promise<void> {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId }, select: { workId: true } });
    if (!chapter || chapter.workId !== workId) throw new BadRequestException('Chapitre invalide');
  }
}

/** Order-insensitive equality for two id arrays. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}
