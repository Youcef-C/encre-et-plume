import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { GROUP_GATE_SELECT, assertCanWrite, canManageProject } from './members.service';
import { OPEN_CORRECTION_STATUS, countOpenCorrections, openTypesAgainstCurrent, tallyAgainstCurrent, type OpenCorrectionRow } from './open-corrections';

const STAGES = new Set<string>(PAGE_STAGES);
const FILE_TAGS = new Set<string>(PAGE_FILE_TAGS);

/** Shared Prisma include feeding every enriched WorkspacePage (board list, create, update, stage). */
export const WORKSPACE_PAGE_INCLUDE = {
  labels: { include: { label: true } },
  assignees: { include: { user: { select: { id: true, displayName: true, avatar: true } } } },
  checklistItems: { select: { done: true } },
  // CS-3 assets linked to this card → derived linkedFiles (badge/chips/sections). Via the 2026-07-14
  // AssetPageLink join (indexed on pageId); no N+1.
  assetLinks: {
    include: {
      asset: {
        select: {
          id: true,
          type: true,
          filename: true,
          currentVersion: true,
          // CS-20 D-5 — the handoff OFFER's signal: an editor draft newer than the head version means
          // moving the card out of Scénario would pin a version that does not contain those edits.
          // Nested selects, so it rides the SAME batched relation read as linkedFiles (no per-card query).
          scenarioDoc: { select: { updatedAt: true, versionedAt: true } },
          versions: { orderBy: { version: 'desc' }, take: 1, select: { createdAt: true } },
        },
      },
    },
  },
  // CS-20 — the pinned scenario asset's head, so `stale` is derived here and never per card.
  drawnAgainstAsset: { select: { id: true, currentVersion: true } },
  _count: { select: { comments: true } },
  // CS-26 — the open-correction count the card face shows and the VALIDÉ gate enforces. Filtered
  // nested relation = one batched query with the board list, no N+1 and no second endpoint.
  corrections: { where: OPEN_CORRECTION_STATUS, select: { filedAgainstVersion: true, type: true, asset: { select: { currentVersion: true } } } },
} as const;

type PageRow = {
  id: string;
  projectId: string;
  chapterId: string;
  title: string;
  stage: PageStage;
  position?: number;
  fileTags: string[];
  linkedFileIds: string[];
  dueDate?: Date | null;
  createdById?: string | null;
  labels?: { label: { id: string; name: string; color: string } }[];
  assignees?: { user: { id: string; displayName: string; avatar: string | null } }[];
  checklistItems?: { done: boolean }[];
  assetLinks?: {
    asset: {
      id: string;
      type: AssetType;
      filename: string;
      currentVersion: number;
      scenarioDoc?: { updatedAt: Date; versionedAt?: Date | null } | null;
      versions?: { createdAt: Date }[];
    };
  }[];
  _count?: { comments: number };
  corrections?: (OpenCorrectionRow & { type: 'scenario' | 'dessin' })[];
  drawnAgainstVersion?: number | null;
  drawnAgainstAsset?: { id: string; currentVersion: number } | null;
};

/**
 * CS-20 — the card's scenario asset for handoff purposes: the FIRST linked `scenario` asset by
 * filename. A card may link several; the order has to be deterministic or the pin (stamped from the
 * DB query) and the offer signal (derived from the include) could disagree about which one they mean.
 */
function pinnableScenarioAsset(p: PageRow) {
  return (p.assetLinks ?? [])
    .map((l) => l.asset)
    .filter((a) => a.type === 'scenario')
    .sort((a, b) => a.filename.localeCompare(b.filename))[0];
}

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
    position: p.position ?? 0,
    fileTags: p.fileTags as WorkspacePage['fileTags'],
    linkedFileIds: p.linkedFileIds,
    linkedFiles: (p.assetLinks ?? []).map(({ asset: a }) => ({ assetId: a.id, type: a.type, filename: a.filename, version: a.currentVersion })),
    dueDate: toDateOnly(p.dueDate),
    labels: (p.labels ?? []).map((l) => ({ id: l.label.id, name: l.label.name, color: l.label.color })),
    assignees: (p.assignees ?? []).map((a) => ({ accountId: a.user.id, displayName: a.user.displayName, avatar: a.user.avatar })),
    checklistDone: checklist.filter((c) => c.done).length,
    checklistTotal: checklist.length,
    commentCount: p._count?.comments ?? 0,
    openCorrectionCount: tallyAgainstCurrent(p.corrections ?? []),
    openCorrectionTypes: openTypesAgainstCurrent(p.corrections ?? []),
    // CS-10 D-1: the FE mirrors the delete rule from this (never as the only gate).
    createdById: p.createdById ?? null,
    handoff: toHandoff(p),
    scenarioUnsaved: hasUnsavedScenario(p),
  };
}

/** CS-20 — `stale` is computed HERE, from the pinned asset already included, so the board never
 *  recomputes it per card. `drawnAgainstAsset` is null once the asset is deleted (FK SetNull) → no pin. */
function toHandoff(p: PageRow): WorkspacePage['handoff'] {
  const asset = p.drawnAgainstAsset;
  const version = p.drawnAgainstVersion;
  if (!asset || version == null) return null;
  return { assetId: asset.id, version, headVersion: asset.currentVersion, stale: version < asset.currentVersion };
}

/**
 * CS-20 D-5 — the pinnable scenario's editor draft has edits newer than its head version.
 *
 * `versionedAt` is stamped by the two paths that cut a version of this document (snapshot, and the
 * v1 the materialize path creates), so the test is exact: any edit after that instant is unsaved,
 * including one made in the same second as the version write.
 *
 * ponytail: legacy rows (written before the column existed) have `versionedAt` NULL — the migration
 * back-fills nothing — so they keep the ORIGINAL comparison, grace window included. That window was
 * needed because the first save writes AssetVersion v1 BEFORE inserting the ScenarioDocument row, so
 * a freshly-versioned legacy draft is always a few ms "newer" than its own v1. Documented ceiling on
 * legacy rows only: an edit made within 5s of a version write is not detected. Drop this branch once
 * every ScenarioDocument has been versioned at least once since the migration.
 */
const VERSION_WRITE_GRACE_MS = 5_000;

function hasUnsavedScenario(p: PageRow): boolean {
  const asset = pinnableScenarioAsset(p);
  const doc = asset?.scenarioDoc;
  if (!doc?.updatedAt) return false;
  if (doc.versionedAt) return doc.updatedAt.getTime() > doc.versionedAt.getTime();
  const headAt = asset?.versions?.[0]?.createdAt; // legacy row
  return !headAt || doc.updatedAt.getTime() > headAt.getTime() + VERSION_WRITE_GRACE_MS;
}

/**
 * CS-2 kanban card CRUD + stage transitions. Every route resolves page → project → membership
 * (owner or WorkCreator on the linked Work): unknown id → 404, non-member → 403. Card = `Page`
 * (board card), never `Planche` (reader page). Per-file versioning is owned by CS-3 (Asset); the
 * card badge is a derived rollup of `linkedFiles`. A stage→corrections transition fires the F-5
 * `project_activity` notification to the other members.
 */
// The WIRE shapes: `chapterId` may arrive missing or null even though the shared request types
// require it, so the service can answer the R2-1 / R2-5c 400 rather than trusting the client.
type CreatePageBody = Omit<CreatePageRequest, 'chapterId'> & { chapterId?: string | null };
type UpdatePageBody = Omit<UpdatePageRequest, 'chapterId'> & { chapterId?: string | null };

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPage(accountId: string, slug: string, body: CreatePageBody): Promise<WorkspacePage> {
    const project = await this.resolveWritableProject(accountId, slug);

    const stage = this.assertStage(body.stage ?? 'scenario');
    // R2-1 (user rule, 2026-07-31): a chapter is a PREREQUISITE for a card. This deliberately changes
    // the shipped CS-2 create contract — the board hides "＋ Ajouter une carte" until a chapter is
    // selected, and this is the server-side truth behind it. R2-1d then made `Page.chapterId` NOT
    // NULL, so this 400 is the boundary check in front of a constraint, not the only guard.
    const chapterId = body.chapterId ?? null;
    if (!chapterId) throw new BadRequestException('Créez un chapitre avant d’ajouter une carte.');
    await this.assertChapterInWork(chapterId, project.workId);

    // R8-1 — positions are dense (0..n-1), so the chapter's card count IS both the default title's
    // number and the new card's slot: a new card always lands LAST. One count, two uses.
    const count = await this.prisma.page.count({ where: { projectId: project.id, chapterId } });
    const title = body.title?.trim() ? body.title.trim() : `Page ${count + 1}`;

    const page = await this.prisma.page.create({
      // CS-10 D-1: stamp the author — the delete gate reads it back.
      data: { projectId: project.id, chapterId, title, stage, position: count, fileTags: [], linkedFileIds: [], createdById: accountId },
      include: WORKSPACE_PAGE_INCLUDE,
    });
    return toWorkspacePage(page as PageRow);
  }

  async updatePage(accountId: string, pageId: string, body: UpdatePageBody): Promise<WorkspacePage> {
    // Editing a card's fields is an ordinary « Écriture » write (CS-10 D-1 covers only create and
    // delete explicitly — this is the inferred reading, recorded in the notes).
    const page = await this.loadWritablePage(accountId, pageId);

    if (body.fileTags && body.fileTags.some((t) => !FILE_TAGS.has(t))) {
      throw new BadRequestException('Type de fichier invalide');
    }
    // R2-5 — moving a card between chapters reuses THIS route (no parallel "move" endpoint). The
    // target must belong to the same work/project, and clearing the chapter is refused outright:
    // under R2-1d a chapterless card is not a representable state (the column is NOT NULL).
    if (body.chapterId === null) throw new BadRequestException('Une carte doit appartenir à un chapitre.');
    if (body.chapterId) await this.assertChapterInWork(body.chapterId, page.project.workId);

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

    // R8-1 — PLACEMENT. The strip's drag and the modal's field are the SAME operation ("put this card
    // at slot N"), so there is no parallel reorder route. A chapter move with no slot appends.
    const destChapterId = body.chapterId ?? page.chapterId;
    const placing = body.position !== undefined || (body.chapterId !== undefined && body.chapterId !== page.chapterId);

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
      // Slot order of the DESTINATION chapter, this card removed — where it is about to be spliced
      // back in. ponytail: one UPDATE per shifted sibling; a chapter is tens of cards, so a single
      // CASE-expression write would be premature. Revisit if chapters ever hold thousands.
      let siblings: { id: string; position: number }[] = [];
      let index = 0;
      if (placing) {
        const rows = await tx.page.findMany({
          where: { chapterId: destChapterId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, position: true },
        });
        siblings = rows.filter((r) => r.id !== pageId);
        // 1-based on the wire, clamped: an out-of-range slot lands at an end, never leaves a gap.
        index = body.position === undefined ? siblings.length : Math.min(Math.max(body.position - 1, 0), siblings.length);
        data.position = index;
      }

      const row = await tx.page.update({ where: { id: pageId }, data, include: WORKSPACE_PAGE_INCLUDE });

      if (placing) {
        // Renumber the shifted siblings only — the moved card already carries its slot above, and a
        // sibling whose slot did not change is not rewritten.
        siblings.splice(index, 0, { id: pageId, position: index });
        for (const [i, s] of siblings.entries()) {
          if (s.id !== pageId && s.position !== i) await tx.page.update({ where: { id: s.id }, data: { position: i } });
        }
      }
      return row;
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
        // CS-20: the same two nested selects the board include carries, so `handoff`/`scenarioUnsaved`
        // are truthful here too — the modal's detail is merged into the board's card copy.
        assetLinks: {
          include: {
            asset: {
              select: {
                id: true,
                type: true,
                filename: true,
                currentVersion: true,
                scenarioDoc: { select: { updatedAt: true, versionedAt: true } },
                versions: { orderBy: { version: 'desc' }, take: 1, select: { createdAt: true } },
              },
            },
          },
        },
        drawnAgainstAsset: { select: { id: true, currentVersion: true } },
        _count: { select: { comments: true } },
        // Latent-bug fix (found 2026-09-01): without this select toWorkspacePage computed
        // openCorrectionCount/Types from `undefined` — always 0/[] in the detail response.
        corrections: { where: OPEN_CORRECTION_STATUS, select: { filedAgainstVersion: true, type: true, asset: { select: { currentVersion: true } } } },
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

  /**
   * CS-10 D-1 — deleting a card has its OWN rule, so this deliberately resolves through the READ
   * resolver and gates here instead of using `loadWritablePage`:
   *   leader ∪ co-leader ∪ owner  →  may delete ANY card (cleans up a departed member's cards)
   *   anyone else                 →  only the cards they created
   * The leadership test is `canManageProject`, NOT `isGroupLeader` — the latter deliberately returns
   * false for co-leaders (it exists for the CS-16 project-delete gate) and would silently exclude
   * exactly the row this rule grants. `createdById === null` (a pre-column card whose backfill did not
   * land) matches nobody, so it degrades to leadership-only: fail closed, never open.
   */
  async deletePage(accountId: string, pageId: string): Promise<void> {
    const page = await this.loadMemberPage(accountId, pageId);
    if (!canManageProject(page.project, accountId) && page.createdById !== accountId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que les cartes que vous avez créées.');
    }
    await this.prisma.page.delete({ where: { id: pageId } });
  }

  async updateStage(accountId: string, pageId: string, body: UpdatePageStageRequest): Promise<WorkspacePage> {
    const stage = this.assertStage(body.stage);
    // Moving a card between stages is an ordinary « Écriture » write (inferred — see updatePage).
    const page = await this.loadWritablePage(accountId, pageId);
    const enteredCorrections = stage === 'corrections' && page.stage !== 'corrections';

    // CS-26 — the terminal column means "finished", so it is gated the way Corrections → PROPRE
    // already is: no corrections open against the CURRENT version of the files this card ships.
    // Same 409 body as the PROPRE route; already-`valide` stays a no-op; 403 precedes it because
    // `loadWritablePage` ran first. Every other transition is untouched.
    if (stage === 'valide' && page.stage !== 'valide') {
      const unresolved = await countOpenCorrections(this.prisma, pageId, { againstCurrentVersionOnly: true });
      if (unresolved > 0) throw new ConflictException({ message: 'Corrections non résolues', unresolved });
    }

    // CS-20 — the handoff stamp. Deliberately AFTER `loadWritablePage` (403 first) and AFTER the
    // CS-26 guard (a refused move pins nothing), and it NEVER overwrites an existing pin: re-pinning
    // is the explicit acknowledge. A card with no linked scenario asset moves with no pin, no error.
    const data: { stage: PageStage; drawnAgainstAssetId?: string; drawnAgainstVersion?: number } = { stage };
    if (page.stage === 'scenario' && stage !== 'scenario' && page.drawnAgainstAssetId == null) {
      // Deterministic pick (lowest filename) — a card may link several scenario assets, and the pin
      // and the offer signal must never disagree about which one they mean.
      const asset = [...(page.assetLinks ?? [])].sort((a, b) => a.asset.filename.localeCompare(b.asset.filename))[0]?.asset;
      if (asset) {
        data.drawnAgainstAssetId = asset.id;
        data.drawnAgainstVersion = asset.currentVersion;
      }
    }

    const updated = await this.prisma.page.update({ where: { id: pageId }, data, include: WORKSPACE_PAGE_INCLUDE });

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

  /**
   * CS-20 — « J'ai pris connaissance »: re-pin the card to the scenario's CURRENT head. « Écriture »
   * (the banner is readable by every member; acting on it is a write). Idempotent at head — the
   * artist acknowledging twice is not an error. 409 when the card carries no pin: there is nothing
   * to acknowledge, and silently creating one would claim a handoff that never happened.
   */
  async acknowledgeHandoff(accountId: string, pageId: string): Promise<WorkspacePage> {
    const page = await this.loadWritablePage(accountId, pageId);
    const asset = page.drawnAgainstAsset;
    if (!asset) throw new ConflictException('Aucune passation enregistrée');
    const updated = await this.prisma.page.update({
      where: { id: pageId },
      data: { drawnAgainstVersion: asset.currentVersion },
      include: WORKSPACE_PAGE_INCLUDE,
    });
    return toWorkspacePage(updated as PageRow);
  }

  /** CS-20 — drop the pin: the card is no longer drawn against a fixed script. « Écriture »; 404
   *  when there is no pin (deleting nothing is not a success). */
  async deleteHandoff(accountId: string, pageId: string): Promise<WorkspacePage> {
    const page = await this.loadWritablePage(accountId, pageId);
    if (!page.drawnAgainstAssetId) throw new NotFoundException('Aucune passation enregistrée');
    const updated = await this.prisma.page.update({
      where: { id: pageId },
      data: { drawnAgainstAssetId: null, drawnAgainstVersion: null },
      include: WORKSPACE_PAGE_INCLUDE,
    });
    return toWorkspacePage(updated as PageRow);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * READ resolver — page + project membership context; 404 unknown, 403 non-member. Public so the
   * card-collab comment routes and CS-5 corrections reuse the single CS-2 membership rule.
   *
   * Reaching for THIS on a write path is the deliberate, visible opt-out (comments are member-gated
   * by a recorded CS-10 decision; `deletePage` has its own stricter rule). Anything that persists card
   * content goes through `loadWritablePage` instead.
   */
  async loadMemberPage(accountId: string, pageId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: {
        // CS-10: the group columns ride along so the write resolver can gate. One shared select
        // constant — the whole B-2/B-4 bug class started as a select that omitted these.
        project: { include: { work: { include: { creators: { select: GROUP_GATE_SELECT } } } } },
        assignees: { select: { userId: true } },
        // CS-20: the card's scenario assets (for the handoff stamp) and the pinned asset's head (for
        // the acknowledge) ride along on the resolver's ONE read. Deliberately not two extra queries
        // on the stage path: `PATCH /pages/:id/stage` is answered optimistically by the board, and a
        // third round-trip widened the window in which the card modal's detail fetch still saw the
        // pre-move row (it made a pre-existing read-after-write race easy to hit in e2e).
        assetLinks: { where: { asset: { type: 'scenario' } }, select: { asset: { select: { id: true, filename: true, currentVersion: true } } } },
        drawnAgainstAsset: { select: { id: true, currentVersion: true } },
      },
    });
    if (!page) throw new NotFoundException('Carte introuvable');
    if (!isMemberOf(page.project, accountId)) throw new ForbiddenException('Réservé aux membres du projet');
    return page as typeof page & {
      title: string;
      stage: PageStage;
      linkedFileIds: string[];
      createdById: string | null;
      drawnAgainstAssetId: string | null;
      drawnAgainstAsset: { id: string; currentVersion: number } | null;
      assetLinks?: { asset: { id: string; filename: string; currentVersion: number } }[];
      assignees: { userId: string }[];
      project: { ownerId: string; workId: string; work: { creators: { accountId: string; groupRole: string; permissions: string[] }[] } };
    };
  }

  /**
   * WRITE resolver — membership AND « Écriture », enforced HERE rather than at each call site.
   *
   * CS-10 D-2: the same missing-gate bug shipped three times (CS-4 gateway ✓ / scenario REST ✗ → B-2;
   * B-2 ✓ / asset routes ✗ → B-4; B-4 ✓ / page routes ✗). A route that resolves through this is safe
   * by default, and a route that wants membership only has to say so out loud by calling
   * `loadMemberPage`. Omission fails CLOSED. Public: card-collab's checklist routes use it too.
   */
  async loadWritablePage(accountId: string, pageId: string) {
    const page = await this.loadMemberPage(accountId, pageId);
    assertCanWrite(page.project, accountId);
    return page;
  }

  /** WRITE resolver for the by-slug card routes (createPage): membership AND « Écriture ». */
  private async resolveWritableProject(accountId: string, slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: { work: { include: { creators: { select: GROUP_GATE_SELECT } } } },
    });
    if (!project) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project, accountId)) throw new ForbiddenException('Réservé aux membres du projet');
    assertCanWrite(project, accountId);
    return project;
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
