import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageDto, ProjectChatPage, SendProjectMessageRequest } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messaging/messages.service';
import { isMemberOf } from './projects.service';
import { GROUP_GATE_SELECT } from './members.service';

const PROJECT_GATE_INCLUDE = { work: { include: { creators: { select: GROUP_GATE_SELECT } } } } as const;

type ProjectRow = {
  id: string;
  title: string;
  ownerId: string;
  visibility: string;
  work: { creators: { accountId: string }[] } | null;
};

interface PageOpts {
  cursor?: string;
  limit?: number;
}

/**
 * CS-8 « Discussion » — the project's team thread.
 *
 * There is NO parallel project `Message` entity: the story's thread IS a
 * `Conversation { type:'group', projectId }`, the seam MC-9 already reserved. Everything a chat needs
 * (validation, attachments, realtime fan-out, F-5 offline notifications, pagination) lives in
 * `MessagesService` and is DELEGATED here, never re-derived — the same reasoning CS-10 used for
 * `assertCanWrite`.
 *
 * What this service owns, and only this:
 *  1. provisioning that one conversation on first access (`@@unique([projectId])` makes "one thread
 *     per project" unrepresentable rather than app-enforced; the loser of a race adopts the winner);
 *  2. keeping its participants EQUAL to the project's member set — a newly added co-author gains the
 *     history feed and a revoked one loses it;
 *  3. the member gate (the workspace 404/403 matrix). AD-11's admin/maintainer oversight read is
 *     deliberately NOT built here (plan D-5) — a maintainer is a stranger to this thread.
 */
@Injectable()
export class ProjectChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  // ── GET /projects/:slug/messages ────────────────────────────────────────────
  async list(accountId: string, slug: string, opts: PageOpts): Promise<ProjectChatPage> {
    const conversationId = await this.resolveConversation(accountId, slug);
    const page = await this.messages.getMessages(accountId, conversationId, opts);
    // Reaching here means the gate passed, i.e. the viewer is a member — and a member may chat
    // (chatting is coordination, not « Écriture »). The flag exists so a future read-only viewer
    // (AD-11) gets no composer without the panel having to re-derive the rule.
    return { ...page, conversationId, canPost: true };
  }

  // ── POST /projects/:slug/messages ───────────────────────────────────────────
  async send(accountId: string, slug: string, dto: SendProjectMessageRequest): Promise<MessageDto> {
    const conversationId = await this.resolveConversation(accountId, slug);
    // "text or ≥1 attachment", the length cap, the attachment ownership/readiness checks, the rate
    // limit, the realtime emit and the F-5 fan-out are all sendMessage's — one definition.
    return this.messages.sendMessage(accountId, conversationId, {
      ...(dto.text !== undefined ? { body: dto.text } : {}),
      ...(dto.attachments ? { attachments: dto.attachments } : {}),
    });
  }

  /** The project's thread, created on first access, participants kept equal to the project's members. */
  private async resolveConversation(accountId: string, slug: string): Promise<string> {
    const project = (await this.prisma.project.findUnique({
      where: { slug },
      include: PROJECT_GATE_INCLUDE,
    })) as unknown as ProjectRow | null;
    if (!project) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project as never, accountId)) {
      // Same matrix as the workspace read: a public project may admit it exists, a private one may not.
      if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
      throw new NotFoundException('Projet introuvable');
    }

    const conversationId = await this.findOrCreate(project);
    await this.syncParticipants(conversationId, memberIds(project));
    return conversationId;
  }

  private async findOrCreate(project: ProjectRow): Promise<string> {
    const existing = await this.prisma.conversation.findUnique({
      where: { projectId: project.id },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const created = await this.prisma.conversation.create({
        data: {
          type: 'group',
          projectId: project.id,
          name: project.title,
          createdBy: project.ownerId,
          participants: { create: memberIds(project).map((accountId) => ({ accountId })) },
        },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      // Two members opening the tab at once: @@unique([projectId]) rejects the loser, who then adopts
      // the winner's row. Never a second thread, never a 500 on a tab click.
      if (!isUniqueViolation(e)) throw e;
      const won = await this.prisma.conversation.findUnique({
        where: { projectId: project.id },
        select: { id: true },
      });
      if (!won) throw e;
      return won.id;
    }
  }

  /**
   * Participants ≡ members. Additive-only would leak a revoked co-author every future message, so the
   * diff runs both ways. Existing rows are left untouched (their `lastReadAt` is their unread state).
   */
  private async syncParticipants(conversationId: string, members: string[]): Promise<void> {
    const current = (await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { accountId: true },
    })) as { accountId: string }[];

    const have = new Set(current.map((r) => r.accountId));
    const want = new Set(members);
    const toAdd = members.filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !want.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    const ops = [];
    if (toAdd.length > 0) {
      ops.push(
        this.prisma.conversationParticipant.createMany({
          data: toAdd.map((accountId) => ({ conversationId, accountId })),
          skipDuplicates: true, // two tabs syncing at once must not 500 on the composite PK
        }),
      );
    }
    if (toRemove.length > 0) {
      ops.push(
        this.prisma.conversationParticipant.deleteMany({
          where: { conversationId, accountId: { in: toRemove } },
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }
}

/** The project's member set — the owner is a member BY DEFINITION, plus every WorkCreator row. */
function memberIds(project: ProjectRow): string[] {
  return [...new Set([project.ownerId, ...(project.work?.creators ?? []).map((c) => c.accountId)])];
}

/** A `projectId` collision, duck-typed so this service keeps no Prisma namespace import. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}
