import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateChecklistItemRequest,
  CreateLabelRequest,
  CreatePageCommentRequest,
  PageChecklistItemDto,
  PageCommentItem,
  ProjectLabelItem,
  UpdateChecklistItemRequest,
  UpdateLabelRequest,
  UpdatePageCommentRequest,
} from '@encre-et-plume/shared';
import { LABEL_COLORS } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PagesService } from './pages.service';
import { isMemberOf } from './projects.service';
import { GROUP_GATE_SELECT, assertCanWrite } from './members.service';

const PALETTE = new Set<string>(LABEL_COLORS);

type ProjectShape = { ownerId: string; visibility: string; work: { creators: { accountId: string }[] } | null };

/**
 * CS-2 card-modal extension: project labels + per-card checklist + comments (with @name mention
 * notifications). Membership is the single CS-2 rule (PagesService.loadMemberPage / isMemberOf).
 *
 * CS-10 D-2 gate placement — labels and checklist items are project content, so they resolve through
 * the WRITE resolvers (`loadWritableProjectBySlug` / `loadWritableLabel` / `pages.loadWritablePage`).
 * Comments deliberately resolve through the READ resolver: a recorded CS-10 decision says a comment
 * is not « Écriture ». Every opt-out is at a call site, visible, and never an omission.
 *
 * INFERRED: the user's D-1/D-2 decision named kanban cards only. Gating labels + checklist on
 * « Écriture » is the safe default extension — flagged in `.claude/pipeline/_fixes/kanban-authz/`.
 */
@Injectable()
export class CardCollabService {
  private readonly logger = new Logger(CardCollabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pages: PagesService,
  ) {}

  // ── labels ─────────────────────────────────────────────────────────────────

  async listLabels(accountId: string, slug: string): Promise<ProjectLabelItem[]> {
    const project = await this.loadProjectBySlug(slug);
    this.assertCanRead(project, accountId);
    const rows = await this.prisma.projectLabel.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, color: true },
    });
    return rows;
  }

  async createLabel(accountId: string, slug: string, body: CreateLabelRequest): Promise<ProjectLabelItem> {
    const project = await this.loadWritableProjectBySlug(accountId, slug);
    const name = this.assertName(body.name);
    this.assertColor(body.color);
    const row = await this.prisma.projectLabel.create({
      data: { projectId: project.id, name, color: body.color },
      select: { id: true, name: true, color: true },
    });
    return { id: row.id, name: row.name, color: row.color };
  }

  async updateLabel(accountId: string, labelId: string, body: UpdateLabelRequest): Promise<ProjectLabelItem> {
    await this.loadWritableLabel(accountId, labelId);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = this.assertName(body.name);
    if (body.color !== undefined) {
      this.assertColor(body.color);
      data.color = body.color;
    }
    const row = await this.prisma.projectLabel.update({
      where: { id: labelId },
      data,
      select: { id: true, name: true, color: true },
    });
    return { id: row.id, name: row.name, color: row.color };
  }

  async deleteLabel(accountId: string, labelId: string): Promise<void> {
    await this.loadWritableLabel(accountId, labelId);
    // The PageLabel FK is onDelete: Cascade → the label vanishes from every card automatically.
    await this.prisma.projectLabel.delete({ where: { id: labelId } });
  }

  // ── checklist ────────────────────────────────────────────────────────────────

  async addChecklistItem(accountId: string, pageId: string, body: CreateChecklistItemRequest): Promise<PageChecklistItemDto> {
    await this.pages.loadWritablePage(accountId, pageId);
    const text = this.assertText(body.text);
    const last = await this.prisma.pageChecklistItem.findFirst({
      where: { pageId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;
    const row = await this.prisma.pageChecklistItem.create({ data: { pageId, text, order } });
    return toChecklistItem(row);
  }

  async updateChecklistItem(accountId: string, itemId: string, body: UpdateChecklistItemRequest): Promise<PageChecklistItemDto> {
    const item = await this.prisma.pageChecklistItem.findUnique({ where: { id: itemId }, select: { id: true, pageId: true } });
    if (!item) throw new NotFoundException('Élément introuvable');
    await this.pages.loadWritablePage(accountId, item.pageId);
    const data: Record<string, unknown> = {};
    if (body.text !== undefined) data.text = this.assertText(body.text);
    if (body.done !== undefined) data.done = body.done;
    const row = await this.prisma.pageChecklistItem.update({ where: { id: itemId }, data });
    return toChecklistItem(row);
  }

  async deleteChecklistItem(accountId: string, itemId: string): Promise<void> {
    const item = await this.prisma.pageChecklistItem.findUnique({ where: { id: itemId }, select: { id: true, pageId: true } });
    if (!item) throw new NotFoundException('Élément introuvable');
    await this.pages.loadWritablePage(accountId, item.pageId);
    await this.prisma.pageChecklistItem.delete({ where: { id: itemId } });
  }

  // ── comments ────────────────────────────────────────────────────────────────

  async addComment(accountId: string, pageId: string, body: CreatePageCommentRequest): Promise<PageCommentItem> {
    const page = await this.pages.loadMemberPage(accountId, pageId);
    const text = this.assertBody(body.body);
    const row = await this.prisma.pageComment.create({
      data: { pageId, authorId: accountId, body: text },
      include: { author: { select: { id: true, displayName: true, avatar: true } } },
    });
    await this.notifyMentions(accountId, page.projectId, page.title, page.project as unknown as ProjectShape, text, '');
    return toCommentItem(row);
  }

  async updateComment(accountId: string, commentId: string, body: UpdatePageCommentRequest): Promise<PageCommentItem> {
    const comment = await this.loadComment(commentId);
    if (comment.authorId !== accountId) throw new ForbiddenException("Réservé à l'auteur·rice");
    const text = this.assertBody(body.body);
    const row = await this.prisma.pageComment.update({
      where: { id: commentId },
      data: { body: text, editedAt: new Date() },
      include: { author: { select: { id: true, displayName: true, avatar: true } } },
    });
    await this.notifyMentions(accountId, comment.page.projectId, comment.page.title, comment.page.project, text, comment.body);
    return toCommentItem(row);
  }

  async deleteComment(accountId: string, commentId: string): Promise<void> {
    const comment = await this.loadComment(commentId);
    const isAuthor = comment.authorId === accountId;
    const isOwner = comment.page.project.ownerId === accountId;
    if (!isAuthor && !isOwner) throw new ForbiddenException("Réservé à l'auteur·rice ou au propriétaire du projet");
    await this.prisma.pageComment.delete({ where: { id: commentId } });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** READ resolver — the project row; the caller applies `assertCanRead`/`assertMember`. */
  private async loadProjectBySlug(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      // CS-10 D-2: always the shared gate select, so the write variant below can actually gate.
      include: { work: { include: { creators: { select: GROUP_GATE_SELECT } } } },
    });
    if (!project || !project.work) throw new NotFoundException('Projet introuvable');
    return project;
  }

  /** WRITE resolver — membership AND « Écriture », enforced here so a new caller is safe by default. */
  private async loadWritableProjectBySlug(accountId: string, slug: string) {
    const project = await this.loadProjectBySlug(slug);
    this.assertMember(project as unknown as ProjectShape, accountId);
    assertCanWrite(project as never, accountId);
    return project;
  }

  /** WRITE resolver for a label — 404 unknown, then membership AND « Écriture » on its project. */
  private async loadWritableLabel(accountId: string, labelId: string) {
    const label = await this.prisma.projectLabel.findUnique({
      where: { id: labelId },
      include: { project: { include: { work: { include: { creators: { select: GROUP_GATE_SELECT } } } } } },
    });
    if (!label) throw new NotFoundException('Étiquette introuvable');
    this.assertMember(label.project as unknown as ProjectShape, accountId);
    assertCanWrite(label.project as never, accountId);
    return label;
  }

  private async loadComment(commentId: string) {
    const comment = await this.prisma.pageComment.findUnique({
      where: { id: commentId },
      include: {
        page: {
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { ownerId: true, visibility: true, work: { select: { creators: { select: { accountId: true } } } } } },
          },
        },
      },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    return comment as unknown as {
      id: string;
      authorId: string;
      body: string;
      page: { id: string; title: string; projectId: string; project: ProjectShape };
    };
  }

  /** Member → OK; non-member public → 403; non-member private → 404 (no existence leak). */
  private assertMember(project: ProjectShape, accountId: string): void {
    if (isMemberOf(project, accountId)) return;
    if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
    throw new NotFoundException('Projet introuvable');
  }

  /** Member or public → readable; non-member private → 404. */
  private assertCanRead(project: ProjectShape, accountId: string): void {
    if (!isMemberOf(project, accountId) && project.visibility !== 'public') throw new NotFoundException('Projet introuvable');
  }

  private assertName(name: string): string {
    const t = (name ?? '').trim();
    if (!t) throw new BadRequestException('Un nom est requis');
    return t;
  }

  private assertColor(color: string): void {
    if (!PALETTE.has(color)) throw new BadRequestException('Couleur invalide');
  }

  private assertText(text: string): string {
    const t = (text ?? '').trim();
    if (!t) throw new BadRequestException('Un texte est requis');
    return t;
  }

  private assertBody(body: string): string {
    const t = (body ?? '').trim();
    if (!t) throw new BadRequestException('Un commentaire est requis');
    return t;
  }

  /**
   * F-5 mention side effect (best-effort — never fails the comment write). A member is "mentioned"
   * iff the body contains `@` + their displayName as a whole token (case-insensitive): the `@` must
   * start the token (not preceded by a word char or another `@`, so `email@alice` doesn't count) and
   * the name must not be a prefix of a longer word (so `@Ali` doesn't fire for a longer `@Alice`).
   * On edit we only notify mentions that are NEW (not already in oldBody). Author never self-notifies.
   */
  private async notifyMentions(
    actorId: string,
    projectId: string,
    pageTitle: string,
    project: ProjectShape,
    newBody: string,
    oldBody: string,
  ): Promise<void> {
    const memberIds = projectMemberIds(project).filter((id) => id !== actorId);
    if (memberIds.length === 0) return;
    const members = await this.prisma.account.findMany({ where: { id: { in: memberIds } }, select: { id: true, displayName: true } });
    for (const m of members) {
      if (m.id === actorId) continue; // never notify the author (defensive: query already excludes them)
      if (isMentioned(newBody, m.displayName) && !isMentioned(oldBody, m.displayName)) {
        try {
          await this.notifications.create({
            recipientId: m.id,
            type: 'mention',
            refId: projectId,
            sourceUserId: actorId,
            message: `Vous avez été mentionné·e sur « ${pageTitle} »`,
          });
        } catch (e) {
          this.logger.error(`CS-2 mention notify failed for ${m.id}: ${(e as Error).message}`);
        }
      }
    }
  }
}

/**
 * True iff `body` mentions `@displayName` as a whole token. The `@` must not follow a word char or
 * another `@` (rules out `email@alice`), and the name must not be immediately followed by a word char
 * (rules out `@Ali` matching inside `@Alice`). Case-insensitive; the name is regex-escaped.
 */
function isMentioned(body: string, displayName: string): boolean {
  const name = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w@])@${name}(?!\\w)`, 'i').test(body);
}

function projectMemberIds(project: ProjectShape): string[] {
  return [...new Set([project.ownerId, ...(project.work?.creators.map((c) => c.accountId) ?? [])])];
}

function toChecklistItem(row: { id: string; text: string; done: boolean; order: number }): PageChecklistItemDto {
  return { id: row.id, text: row.text, done: row.done, order: row.order };
}

function toCommentItem(row: {
  id: string;
  authorId: string;
  body: string;
  createdAt: Date;
  editedAt?: Date | null;
  author: { displayName: string; avatar: string | null };
}): PageCommentItem {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.author.displayName,
    authorAvatar: row.author.avatar,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
  };
}
