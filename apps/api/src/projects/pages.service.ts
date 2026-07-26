import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AssetType,
  CreatePageRequest,
  PageDetailResponse,
  PageStage,
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

/** Shared Prisma include feeding every enriched WorkspacePage (board list, create, update, stage). */
export const WORKSPACE_PAGE_INCLUDE = {
  labels: { include: { label: true } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
  checklistItems: { select: { done: true } },
  // CS-3 assets linked to this card → derived linkedFiles (badge/chips/sections). Via the 2026-07-14
  // AssetPageLink join (indexed on pageId); no N+1.
  assetLinks: { include: { asset: { select: { id: true, type: true, filename: true, currentVersion: true } } } },
  _count: { select: { comments: true } },
} as const;

type PageRow = {
  id: string;
  projectId: string;
  chapterId: string | null;
  title: string;
  stage: PageStage;
  fileTags: string[];
  linkedFileIds: string[];
  dueDate?: Date | null;
  labels?: { label: { id: string; name: string; color: string } }[];
  assignees?: { user: { id: string; displayName: string; avatar: string | null } }[];
  checklistItems?: { done: boolean }[];
  assetLinks?: { asset: { id: string; type: AssetType; filename: string; currentVersion: number } }[];
  _count?: { comments: number };
};

/** Serialize a date-only column as 'YYYY-MM-DD' (stored at UTC midnight). */
function toDateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toWorkspacePage(p: PageRow): WorkspacePage {
  const checklist = p.checklistItems ?? [];
  return {
    id: p.id,
    chapterId: p.chapterId,
    title: p.title,
    stage: p.stage,
    fileTags: p.fileTags as WorkspacePage['fileTags'],
    linkedFileIds: p.linkedFileIds,
    linkedFiles: (p.assetLinks ?? []).map(({ asset: a }) => ({ assetId: a.id, type: a.type, filename: a.filename, version: a.currentVersion })),
    dueDate: toDateOnly(p.dueDate),
    labels: (p.labels ?? []).map((l) => ({ id: l.label.id, name: l.label.name, color: l.label.color })),
    assignees: (p.assignees ?? []).map((a) => ({ accountId: a.user.id, displayName: a.user.displayName, avatar: a.user.avatar })),
    checklistDone: checklist.filter((c) => c.done).length,
    checklistTotal: checklist.length,
    commentCount: p._count?.comments ?? 0,
  };
}

/**
 * CS-2 kanban card CRUD + stage transitions. Every route resolves page → project → membership
 * (owner or WorkCreator on the linked Work): unknown id → 404, non-member → 403. Card = `Page`
 * (board card), never `Planche` (reader page). Per-file versioning is owned by CS-3 (Asset); the
 * card badge is a derived rollup of `linkedFiles`. A stage→corrections transition fires the F-5
 * `project_activity` notification to the other members.
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

    const page = await this.prisma.page.create({
      data: { projectId: project.id, chapterId, title, stage, fileTags: [], linkedFileIds: [] },
      include: WORKSPACE_PAGE_INCLUDE,
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
    if (body.description !== undefined) data.description = body.description;
    if (body.dueDate !== undefined) data.dueDate = this.parseDueDate(body.dueDate);

    // CS-2: labels/assignees must belong to the SAME project — validate before we touch the DB.
    if (body.labelIds !== undefined) await this.assertLabelsInProject(body.labelIds, page.projectId);
    let assigneeDiff: { added: string[]; removed: string[] } | null = null;
    if (body.assigneeIds !== undefined) {
      this.assertAssigneesAreMembers(body.assigneeIds, page.project);
      assigneeDiff = diffAssignees(page.assignees.map((a) => a.userId), body.assigneeIds, accountId);
    }

    // linkedFileIds is NOT writable here — CS-3's link endpoints own the link state (and the
    // per-file version chain). A page PATCH never touches it (would drift from the AssetPageLink join).

    const updated = await this.prisma.$transaction(async (tx) => {
      if (body.labelIds !== undefined) {
        await tx.pageLabel.deleteMany({ where: { pageId } });
        if (body.labelIds.length > 0) {
          await tx.pageLabel.createMany({ data: body.labelIds.map((labelId) => ({ pageId, labelId })) });
        }
      }
      if (body.assigneeIds !== undefined) {
        await tx.pageAssignee.deleteMany({ where: { pageId } });
        if (body.assigneeIds.length > 0) {
          await tx.pageAssignee.createMany({ data: body.assigneeIds.map((userId) => ({ pageId, userId })) });
        }
      }
      return tx.page.update({ where: { id: pageId }, data, include: WORKSPACE_PAGE_INCLUDE });
    });

    // F-5 side effect (best-effort — never fails the request): tell each added/removed member.
    if (assigneeDiff) {
      await this.notifyAssigneeDiff(accountId, page.projectId, page.title, assigneeDiff);
    }
    return toWorkspacePage(updated as PageRow);
  }

  /** GET /pages/:id — full card detail for the modal. Read authz mirrors the CS-1 workspace read:
   *  member → full read; non-member + public project → read; non-member + non-public → 404 (no leak). */
  async getDetail(accountId: string, pageId: string): Promise<PageDetailResponse> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        project: { select: { ownerId: true, visibility: true, work: { select: { creators: { select: { accountId: true } } } } } },
        labels: { include: { label: true } },
        assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
        checklistItems: { orderBy: { order: 'asc' } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, displayName: true, avatar: true } } },
        },
        assetLinks: { include: { asset: { select: { id: true, type: true, filename: true, currentVersion: true } } } },
        _count: { select: { comments: true } },
      },
    });
    if (!page) throw new NotFoundException('Carte introuvable');
    const project = page.project as unknown as { ownerId: string; visibility: string; work: { creators: { accountId: string }[] } };
    if (!isMemberOf(project, accountId) && project.visibility !== 'public') {
      throw new NotFoundException('Carte introuvable');
    }

    type CommentRow = { id: string; authorId: string; body: string; createdAt: Date; editedAt: Date | null; author: { displayName: string; avatar: string | null } };
    type ChecklistRow = { id: string; text: string; done: boolean; order: number };
    return {
      ...toWorkspacePage(page as unknown as PageRow),
      description: (page as unknown as { description: string | null }).description,
      checklist: (page as unknown as { checklistItems: ChecklistRow[] }).checklistItems.map((c) => ({
        id: c.id,
        text: c.text,
        done: c.done,
        order: c.order,
      })),
      comments: (page as unknown as { comments: CommentRow[] }).comments.map((c) => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.author.displayName,
        authorAvatar: c.author.avatar,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
      })),
    };
  }

  async deletePage(accountId: string, pageId: string): Promise<void> {
    await this.loadMemberPage(accountId, pageId);
    await this.prisma.page.delete({ where: { id: pageId } });
  }

  async updateStage(accountId: string, pageId: string, body: UpdatePageStageRequest): Promise<WorkspacePage> {
    const stage = this.assertStage(body.stage);
    const page = await this.loadMemberPage(accountId, pageId);
    const enteredCorrections = stage === 'corrections' && page.stage !== 'corrections';

    const updated = await this.prisma.page.update({ where: { id: pageId }, data: { stage }, include: WORKSPACE_PAGE_INCLUDE });

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

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Load a page with its project membership context; 404 unknown, 403 non-member. Public so the
   *  card-collab routes (checklist/comments) reuse the single CS-2 membership rule. */
  async loadMemberPage(accountId: string, pageId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        // CS-10: the group columns ride along so callers can gate writes with hasGroupPermission().
        project: { include: { work: { include: { creators: { select: { accountId: true, groupRole: true, permissions: true } } } } } },
        assignees: { select: { userId: true } },
      },
    });
    if (!page) throw new NotFoundException('Carte introuvable');
    if (!isMemberOf(page.project, accountId)) throw new ForbiddenException('Réservé aux membres du projet');
    return page as typeof page & {
      title: string;
      stage: PageStage;
      linkedFileIds: string[];
      assignees: { userId: string }[];
      project: { ownerId: string; workId: string; work: { creators: { accountId: string; groupRole: string; permissions: string[] }[] } };
    };
  }

  /** dueDate: null clears; a string is a validated 'YYYY-MM-DD' (DTO @Matches). We re-check the
   *  calendar value here (the regex accepts e.g. 2026-13-45) and store at UTC midnight. */
  private parseDueDate(value: string | null): Date | null {
    if (value === null) return null;
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Date invalide');
    }
    return d;
  }

  /** Every labelId must be a ProjectLabel of this project (else 400). */
  private async assertLabelsInProject(labelIds: string[], projectId: string): Promise<void> {
    if (labelIds.length === 0) return;
    const rows = await this.prisma.projectLabel.findMany({
      where: { id: { in: labelIds } },
      select: { id: true, projectId: true },
    });
    const ok = new Set(rows.filter((r) => r.projectId === projectId).map((r) => r.id));
    if (labelIds.some((id) => !ok.has(id))) throw new BadRequestException('Étiquette invalide');
  }

  /** Every assigneeId must be a member of the card's project (else 400). */
  private assertAssigneesAreMembers(assigneeIds: string[], project: { ownerId: string; work: { creators: { accountId: string }[] } }): void {
    for (const id of assigneeIds) {
      if (!isMemberOf(project, id)) throw new BadRequestException('Membre invalide');
    }
  }

  private async notifyAssigneeDiff(
    actorId: string,
    projectId: string,
    title: string,
    diff: { added: string[]; removed: string[] },
  ): Promise<void> {
    const send = async (recipientId: string, message: string) => {
      try {
        await this.notifications.create({ recipientId, type: 'project_activity', refId: projectId, sourceUserId: actorId, message });
      } catch (e) {
        this.logger.error(`CS-2 assignee notify failed for ${recipientId}: ${(e as Error).message}`);
      }
    };
    for (const id of diff.added) await send(id, `Vous avez été assigné·e à « ${title} »`);
    for (const id of diff.removed) await send(id, `Vous avez été retiré·e de « ${title} »`);
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

/** Added/removed members between the old and new assignee sets, excluding the actor from both. */
function diffAssignees(oldIds: string[], newIds: string[], actorId: string): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  return {
    added: [...newSet].filter((id) => !oldSet.has(id) && id !== actorId),
    removed: [...oldSet].filter((id) => !newSet.has(id) && id !== actorId),
  };
}
