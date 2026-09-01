import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CorrectionDto,
  CorrectionListQuery,
  CorrectionLocationResponse,
  CorrectionListResponse,
  CorrectionStatus,
  CorrectionType,
  CreateCorrectionRequest,
  DessinAnchor,
  ReviewFileItem,
  ReviewPayload,
  ScenarioAnchor,
  UpdateCorrectionRequest,
  ValidateReviewResponse,
} from '@encre-et-plume/shared';
import { CORRECTION_STATUSES, CORRECTIONS_PAGE_SIZE } from '@encre-et-plume/shared';
import type { CaseCommentDto } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaService, sanitizeScenarioHtml } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import { PagesService } from './pages.service';
import { EditorGateway } from './editor.gateway';
import { isMemberOf } from './projects.service';
import { hasGroupPermission } from './members.service';
import { decodeAnchorBytes, toCommentDto, type CommentRow } from './comment-mapper';
import { OPEN_CORRECTION_STATUS, countOpenCorrections } from './open-corrections';

const STATUS_SET = new Set<string>(CORRECTION_STATUSES);
const TEXT_CAP = 500 * 1024; // mirror the CS-3 preview cap for derived-text payloads

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
/** Plain text (.txt version) → paragraph HTML for the diff pane (blank lines split paragraphs). */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

type LoadedPage = {
  id: string;
  projectId: string;
  title: string;
  stage: string;
  project: {
    slug: string;
    title: string;
    ownerId: string;
    work: { creators: { accountId: string; groupRole: string; permissions: string[] }[] } | null;
  };
};

type CorrectionRow = {
  id: string;
  pageId: string;
  type: CorrectionType;
  anchor: unknown;
  assetId: string;
  caseRef: string | null;
  description: string;
  status: CorrectionStatus;
  authorId: string;
  assigneeId: string | null;
  filedAgainstVersion: number;
  resolvedInVersion: number | null;
  resolvedById: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  author: { displayName: string };
  resolvedBy?: { displayName: string } | null;
};

// CS-24 — every correction read carries the filer AND the resolver's display name (the row the
// « en attente de vérification » marker names). One include constant so the two never drift.
const CORRECTION_INCLUDE = {
  author: { select: { displayName: true } },
  resolvedBy: { select: { displayName: true } },
} as const;

/**
 * CS-5 review corrections — one unified entity with a polymorphic anchor (scenario text-range | dessin
 * region). Every page-scoped route reuses PagesService.loadMemberPage (the single CS-2/CS-4 membership
 * gate: 404 unknown, 403 non-member); /corrections/:id routes load the row → its page → same gate.
 * Never trusts a client role/authorship claim: author/assignee gate status + delete, member gate
 * validate. F-5 notifications on every side effect (best-effort — never fail the request).
 */
@Injectable()
export class CorrectionsService {
  private readonly logger = new Logger(CorrectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: PagesService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
    private readonly s3: S3StorageService,
    private readonly gateway: EditorGateway,
  ) {}

  // ── create (POST /pages/:id/corrections) ──────────────────────────────────
  async create(accountId: string, pageId: string, dto: CreateCorrectionRequest): Promise<CorrectionDto> {
    const page = (await this.pages.loadMemberPage(accountId, pageId)) as unknown as LoadedPage;
    assertCanCorrect(page, accountId);
    const description = (dto.description ?? '').trim();
    if (!description) throw new BadRequestException('Description requise');

    let assetId: string;
    let filedAgainstVersion: number;
    let anchor: ScenarioAnchor | DessinAnchor;

    if (dto.type === 'scenario') {
      const a = dto.anchor;
      if (!Number.isInteger(a?.from) || !Number.isInteger(a?.to) || a.from < 0 || a.from >= a.to) {
        throw new BadRequestException('Sélection de texte invalide');
      }
      const quote = a.quote?.trim();
      if (!quote) throw new BadRequestException('Sélection de texte invalide');
      const doc = await this.prisma.scenarioDocument.findUnique({
        where: { id: a.documentId },
        select: { asset: { select: { id: true, projectId: true, currentVersion: true } } },
      });
      if (!doc || doc.asset.projectId !== page.projectId) throw new NotFoundException('Document introuvable');
      assetId = doc.asset.id;
      filedAgainstVersion = doc.asset.currentVersion;
      // CS-22 — validate the optional relative anchors here (the DTO only shape-checks `anchor` as an
      // object): same base64 + 512-byte trust boundary as the plain-comment path, never Yjs-decoded.
      decodeAnchorBytes(a.relFrom);
      decodeAnchorBytes(a.relTo);
      anchor = { documentId: a.documentId, from: a.from, to: a.to, quote, ...(a.relFrom ? { relFrom: a.relFrom } : {}), ...(a.relTo ? { relTo: a.relTo } : {}) };
    } else {
      const region = (dto.anchor as DessinAnchor)?.region;
      if (
        !region ||
        !isFinite(region.x) || !isFinite(region.y) || !isFinite(region.w) || !isFinite(region.h) ||
        region.x < 0 || region.y < 0 || region.w <= 0 || region.h <= 0 ||
        region.x + region.w > 1 || region.y + region.h > 1
      ) {
        throw new BadRequestException('Zone invalide');
      }
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.assetId, projectId: page.projectId, type: { in: ['dessin', 'page'] } },
        select: { id: true, currentVersion: true },
      });
      if (!asset) throw new NotFoundException('Fichier introuvable');
      assetId = asset.id;
      filedAgainstVersion = asset.currentVersion;
      anchor = { region: { x: region.x, y: region.y, w: region.w, h: region.h } };
    }

    const caseRef = dto.caseRef?.trim() || null;
    if (caseRef && caseRef.length > 40) throw new BadRequestException('Référence trop longue');
    const assigneeId = dto.assigneeId ?? null;
    if (assigneeId && !isMemberOf(page.project, assigneeId)) throw new BadRequestException('Personne assignée invalide');

    const correctionData = { pageId, type: dto.type, anchor: anchor as never, assetId, caseRef, description, authorId: accountId, assigneeId, filedAgainstVersion };

    // Fb-2 — a scenario correction IS a tagged CS-4 comment: write the comment + the correction in ONE
    // transaction (linked by commentId), then fan out the comment so open editors paint the highlight +
    // sidebar «Correction» row live. A dessin correction stays a plain correction row.
    if (dto.type === 'scenario') {
      const a = anchor as ScenarioAnchor;
      const caseNo = Number.isInteger(dto.caseNo) && (dto.caseNo as number) > 0 ? (dto.caseNo as number) : 1;
      const { correction, comment } = await this.prisma.$transaction(async (tx) => {
        const comment = await tx.scenarioComment.create({
          data: {
            documentId: a.documentId, caseNo, authorId: accountId, text: description,
            anchorFrom: a.from, anchorTo: a.to, quote: a.quote, version: filedAgainstVersion,
            // CS-22 — AC5: the correction's backing comment carries the durable anchor, so the
            // correction highlight (block-clamped client-side) survives a reload like any comment.
            anchorRelFrom: decodeAnchorBytes(a.relFrom), anchorRelTo: decodeAnchorBytes(a.relTo),
          },
          include: { author: { select: { displayName: true } } },
        });
        const correction = (await tx.correction.create({
          data: { ...correctionData, commentId: comment.id },
          include: CORRECTION_INCLUDE,
        })) as unknown as CorrectionRow;
        return { correction, comment };
      });
      this.gateway.emitComment(assetId, this.commentDtoFor(comment, correction));
      await this.notifyMembers(page, accountId, `Nouvelle demande de correction sur « ${page.title} »`);
      return this.toDto(correction);
    }

    const created = (await this.prisma.correction.create({
      data: correctionData,
      include: CORRECTION_INCLUDE,
    })) as unknown as CorrectionRow;

    await this.notifyMembers(page, accountId, `Nouvelle demande de correction sur « ${page.title} »`);
    return this.toDto(created);
  }

  // ── update status (PATCH /corrections/:id) ────────────────────────────────
  async updateStatus(accountId: string, correctionId: string, dto: UpdateCorrectionRequest): Promise<CorrectionDto> {
    // Feedback round 2 (2026-09-01) — the same PATCH also (re)assigns; both fields are optional but
    // an empty body is a mistake, not a no-op.
    if (dto.status === undefined && dto.assigneeId === undefined) throw new BadRequestException('Aucune modification');
    if (dto.status !== undefined && !STATUS_SET.has(dto.status)) throw new BadRequestException('Statut invalide');
    const correction = (await this.prisma.correction.findUnique({
      where: { id: correctionId },
      include: { ...CORRECTION_INCLUDE, asset: { select: { currentVersion: true } } },
    })) as unknown as (CorrectionRow & { asset: { currentVersion: number } }) | null;
    if (!correction) throw new NotFoundException('Demande introuvable');
    const page = (await this.pages.loadMemberPage(accountId, correction.pageId)) as unknown as LoadedPage;
    assertCanCorrect(page, accountId);

    if (correction.authorId !== accountId && correction.assigneeId !== accountId) {
      throw new ForbiddenException("Réservé à l'auteur·rice ou à la personne assignée");
    }

    const data: Record<string, unknown> = {};
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId && !isMemberOf(page.project, dto.assigneeId)) throw new BadRequestException('Personne assignée invalide');
      data.assigneeId = dto.assigneeId; // null unassigns
    }
    // corrige stamps the resolving head + WHO pressed it (CS-24); reopening (a_corriger/en_cours)
    // clears the whole resolution, verification included — the loop starts over.
    const resolving = dto.status === 'corrige';
    if (dto.status !== undefined) {
      Object.assign(
        data,
        resolving
          ? { status: dto.status, resolvedInVersion: correction.asset.currentVersion, resolvedById: accountId }
          : { status: dto.status, resolvedInVersion: null, resolvedById: null, verifiedAt: null },
      );
    }
    const updated = (await this.prisma.correction.update({
      where: { id: correctionId },
      data,
      include: CORRECTION_INCLUDE,
    })) as unknown as CorrectionRow;

    if (dto.status !== undefined) {
      if (resolving) {
        // CS-24 — the filer is the one person who has to be told, with copy that says so and a refId
        // the notification centre can resolve back to this row. Self-resolution notifies nobody.
        if (correction.authorId !== accountId) {
          await this.notifyUsers([correction.authorId], accountId, page.projectId, 'Votre correction a été marquée corrigée', correction.id);
        }
      } else {
        const recipients = new Set<string>([correction.authorId, ...(correction.assigneeId ? [correction.assigneeId] : [])]);
        recipients.delete(accountId);
        await this.notifyUsers([...recipients], accountId, page.projectId, `Correction « ${short(correction.description)} » : ${statusLabel(dto.status)}`);
      }
    }
    if (dto.assigneeId && dto.assigneeId !== accountId && dto.assigneeId !== correction.assigneeId) {
      await this.notifyUsers([dto.assigneeId], accountId, page.projectId, `Correction « ${short(correction.description)} » vous a été assignée`, correction.id);
    }
    return this.toDto(updated);
  }

  // ── verify (POST /corrections/:id/verify) — the filer acknowledges the fix ─
  async verify(accountId: string, correctionId: string): Promise<CorrectionDto> {
    const correction = (await this.prisma.correction.findUnique({
      where: { id: correctionId },
      include: CORRECTION_INCLUDE,
    })) as unknown as CorrectionRow | null;
    if (!correction) throw new NotFoundException('Demande introuvable');
    const page = (await this.pages.loadMemberPage(accountId, correction.pageId)) as unknown as LoadedPage;
    assertCanCorrect(page, accountId);
    // Filer only — the whole point of the loop is that the resolver cannot close it alone.
    if (correction.authorId !== accountId) throw new ForbiddenException("Seul·e l'auteur·rice de la demande peut vérifier");
    if (correction.status !== 'corrige') throw new ConflictException("La correction n'est pas marquée corrigée");
    if (correction.verifiedAt) return this.toDto(correction); // idempotent

    const updated = (await this.prisma.correction.update({
      where: { id: correctionId },
      data: { verifiedAt: new Date() },
      include: CORRECTION_INCLUDE,
    })) as unknown as CorrectionRow;
    return this.toDto(updated);
  }

  // ── location (GET /corrections/:id/location) — deep-link resolver ──────────
  // F-5 notifications carry a bare uuid refId, so the web resolver route turns it into the review
  // screen that shows this correction. Member-gated read; unknown id → 404 (the caller falls back).
  async location(accountId: string, correctionId: string): Promise<CorrectionLocationResponse> {
    const correction = await this.prisma.correction.findUnique({
      where: { id: correctionId },
      select: { pageId: true, type: true, assetId: true },
    });
    if (!correction) throw new NotFoundException('Demande introuvable');
    const page = (await this.pages.loadMemberPage(accountId, correction.pageId)) as unknown as LoadedPage;
    // CS-24 follow-up — the caller needs the surface, not just the page: a `scenario` correction is a
    // tagged CS-4 comment and is read in the editor; the review list is dessin-only (CS-5 r4).
    return {
      projectSlug: page.project.slug,
      pageId: page.id,
      type: correction.type,
      assetId: correction.type === 'scenario' ? correction.assetId : null,
    };
  }

  // ── delete (DELETE /corrections/:id) — author-only ────────────────────────
  async remove(accountId: string, correctionId: string): Promise<void> {
    const correction = await this.prisma.correction.findUnique({ where: { id: correctionId }, select: { pageId: true, authorId: true, commentId: true, assetId: true } });
    if (!correction) throw new NotFoundException('Demande introuvable');
    const page = (await this.pages.loadMemberPage(accountId, correction.pageId)) as unknown as LoadedPage; // membership gate
    assertCanCorrect(page, accountId); // CS-10 — same gate as create/updateStatus/validate
    if (correction.authorId !== accountId) throw new ForbiddenException("Seul·e l'auteur·rice peut supprimer cette demande");
    // Fb-2 — a scenario correction is a tagged comment: delete the COMMENT (the DB cascade removes this
    // correction) and fan the deletion out to open editors. Legacy comment-less rows delete directly.
    if (correction.commentId) {
      await this.prisma.scenarioComment.delete({ where: { id: correction.commentId } });
      this.gateway.emitCommentDeleted(correction.assetId, correction.commentId);
    } else {
      await this.prisma.correction.delete({ where: { id: correctionId } });
    }
  }

  // ── list (GET /pages/:id/corrections?type=&status=&page=) — paginated ─────
  async list(accountId: string, pageId: string, query: CorrectionListQuery): Promise<CorrectionListResponse> {
    await this.pages.loadMemberPage(accountId, pageId);
    if (query.type && query.type !== 'scenario' && query.type !== 'dessin') throw new BadRequestException('Type invalide');
    if (query.status && !STATUS_SET.has(query.status)) throw new BadRequestException('Statut invalide');

    const where: Record<string, unknown> = { pageId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const page = Math.max(1, query.page ?? 1);
    const total = await this.prisma.correction.count({ where });
    const rows = (await this.prisma.correction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * CORRECTIONS_PAGE_SIZE,
      take: CORRECTIONS_PAGE_SIZE,
      include: CORRECTION_INCLUDE,
    })) as unknown as CorrectionRow[];

    return { items: rows.map((r) => this.toDto(r)), total, page, pageSize: CORRECTIONS_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / CORRECTIONS_PAGE_SIZE)) };
  }

  // ── validate (POST /pages/:id/review/validate) — member-gated, idempotent ─
  async validate(accountId: string, pageId: string): Promise<ValidateReviewResponse> {
    const page = (await this.pages.loadMemberPage(accountId, pageId)) as unknown as LoadedPage;
    assertCanCorrect(page, accountId);
    if (page.stage === 'propre') return { stage: 'propre' }; // idempotent no-op
    if (page.stage !== 'corrections') throw new ConflictException("La carte n'est pas en Corrections");

    // CS-26 — the unresolved rule now lives in ONE place, shared with the VALIDÉ gate. This path
    // stays unqualified by version (Corrections → PROPRE has always blocked on every open row).
    const unresolved = await countOpenCorrections(this.prisma, pageId, { againstCurrentVersionOnly: false });
    if (unresolved > 0) throw new ConflictException({ message: 'Corrections non résolues', unresolved });

    await this.prisma.page.update({ where: { id: pageId }, data: { stage: 'propre' } });
    await this.notifyMembers(page, accountId, `Corrections validées — « ${page.title} » passe en Propre`);
    return { stage: 'propre' };
  }

  // ── review payload (GET /pages/:id/review?file=&from=&to=) ────────────────
  async getReview(accountId: string, pageId: string, opts: { file?: string; from?: number; to?: number }): Promise<ReviewPayload> {
    const page = (await this.pages.loadMemberPage(accountId, pageId)) as unknown as LoadedPage;

    const memberIds = new Set<string>([page.project.ownerId, ...(page.project.work?.creators.map((c) => c.accountId) ?? [])]);
    const memberRows = await this.prisma.account.findMany({ where: { id: { in: [...memberIds] } }, select: { id: true, displayName: true, avatar: true } });
    const members = memberRows.map((m) => ({ accountId: m.id, displayName: m.displayName, avatar: m.avatar }));

    const links = (await this.prisma.assetPageLink.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
      select: { asset: { select: { id: true, filename: true, type: true, currentVersion: true } } },
    })) as unknown as { asset: { id: string; filename: string; type: string; currentVersion: number } }[];

    const files: ReviewFileItem[] = links
      .map((l) => l.asset)
      .filter((a) => surfaceOf(a.type) !== null)
      .map((a) => ({ assetId: a.id, filename: a.filename, type: a.type, surface: surfaceOf(a.type)!, currentVersion: a.currentVersion }));

    const corrections = await this.list(accountId, pageId, {});
    const base: Omit<ReviewPayload, 'selected'> = {
      pageId: page.id,
      pageTitle: page.title,
      stage: page.stage,
      project: { slug: page.project.slug, title: page.project.title },
      members,
      files,
      corrections,
    };

    if (files.length === 0) return { ...base, selected: null };

    // ?file= must be one of the reviewable files; default = first dessin, else first scenario, else first.
    let selectedFile: ReviewFileItem | undefined;
    if (opts.file) {
      selectedFile = files.find((f) => f.assetId === opts.file);
      if (!selectedFile) throw new NotFoundException('Fichier introuvable');
    } else {
      selectedFile = files.find((f) => f.surface === 'dessin') ?? files.find((f) => f.surface === 'scenario') ?? files[0]!;
    }

    const versionRows = (await this.prisma.assetVersion.findMany({
      where: { assetId: selectedFile.assetId },
      orderBy: { version: 'desc' },
      include: { author: { select: { displayName: true } } },
    })) as unknown as { version: number; mediaId: string; note: string | null; createdAt: Date; author: { displayName: string } }[];

    const head = selectedFile.currentVersion;
    // Fb-4: default compare = vN-1 ↔ vN (previous ↔ head); collapses to 1↔1 for a single-version asset.
    // The file/version pickers override either side independently.
    const toVersion = opts.to ?? head;
    const fromVersion = opts.from ?? Math.max(1, toVersion - 1);
    const vFrom = versionRows.find((v) => v.version === fromVersion);
    const vTo = versionRows.find((v) => v.version === toVersion);
    if (!vFrom || !vTo) throw new NotFoundException('Version introuvable');

    const selected: NonNullable<ReviewPayload['selected']> = {
      assetId: selectedFile.assetId,
      surface: selectedFile.surface,
      fromVersion,
      toVersion,
      versions: versionRows.map((v) => ({
        version: v.version,
        authorName: v.author.displayName,
        createdAt: v.createdAt.toISOString(),
        note: v.note,
      })),
      fromHtml: null,
      toHtml: null,
      fromImageUrl: null,
      toImageUrl: null,
    };

    if (selectedFile.surface === 'scenario') {
      // Scenario surface serves the editor version switcher: each version's sanitized HTML (fromHtml/toHtml).
      selected.fromHtml = await this.versionHtml(vFrom.mediaId);
      selected.toHtml = fromVersion === toVersion ? selected.fromHtml : await this.versionHtml(vTo.mediaId);
    } else {
      selected.fromImageUrl = await this.versionImage(accountId, vFrom.mediaId);
      selected.toImageUrl = fromVersion === toVersion ? selected.fromImageUrl : await this.versionImage(accountId, vTo.mediaId);
    }

    return { ...base, selected };
  }

  // ── B5: notify open-correction authors when a new version of their file lands ──
  // Called from AssetsService.appendVersion (every version-bump path). Never throws.
  async notifyNewVersion(assetId: string, actorId: string): Promise<void> {
    try {
      const asset = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { filename: true, projectId: true } });
      if (!asset) return;
      const open = (await this.prisma.correction.findMany({ where: { assetId, ...OPEN_CORRECTION_STATUS }, select: { authorId: true } })) as { authorId: string }[];
      const recipients = new Set(open.map((c) => c.authorId));
      recipients.delete(actorId);
      await this.notifyUsers([...recipients], actorId, asset.projectId, `Nouvelle version de ${asset.filename} — corrections en attente`);
    } catch (e) {
      this.logger.error(`CS-5 notifyNewVersion failed for asset ${assetId}: ${(e as Error).message}`);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async versionHtml(mediaId: string): Promise<string | null> {
    const m = (await this.prisma.media.findUnique({ where: { id: mediaId } })) as unknown as { bucketKey: string; contentType: string } | null;
    if (!m) return null;
    const buf = await this.s3.getObjectBuffer(m.bucketKey);
    if (buf.length > TEXT_CAP) return null;
    // Security: in-app scenario HTML is attacker-controlled (editor.getHTML(), any member can POST it) and
    // the FE renders it via dangerouslySetInnerHTML — ALWAYS run it through the allowlist sanitizer so
    // selected.fromHtml/toHtml can never carry executable HTML. textToHtml is server-generated (safe) but
    // sanitized too for one uniform guarantee.
    if (m.contentType === 'text/html') return sanitizeScenarioHtml(buf.toString('utf8'));
    if (m.contentType === 'text/plain') return sanitizeScenarioHtml(textToHtml(buf.toString('utf8')));
    return null; // other formats → FE shows "Aperçu indisponible"
  }

  private async versionImage(accountId: string, mediaId: string): Promise<string | null> {
    try {
      return (await this.media.signedUrl(accountId, mediaId)).url;
    } catch {
      return null;
    }
  }

  private async notifyMembers(page: LoadedPage, actorId: string, message: string): Promise<void> {
    const recipients = new Set<string>([page.project.ownerId, ...(page.project.work?.creators.map((c) => c.accountId) ?? [])]);
    recipients.delete(actorId);
    await this.notifyUsers([...recipients], actorId, page.projectId, message);
  }

  /** `refId` defaults to the project (the CS-2/CS-5 shape); CS-24 passes the correction id instead. */
  private async notifyUsers(recipientIds: string[], actorId: string, projectId: string, message: string, refId?: string): Promise<void> {
    for (const recipientId of recipientIds) {
      try {
        await this.notifications.create({ recipientId, type: 'project_activity', refId: refId ?? projectId, sourceUserId: actorId, message });
      } catch (e) {
        this.logger.error(`CS-5 notify failed for ${recipientId}: ${(e as Error).message}`);
      }
    }
  }

  /** Build the CaseCommentDto for the WS fan-out of a freshly-tagged scenario correction (Fb-2). */
  private commentDtoFor(comment: CommentRow, correction: CorrectionRow): CaseCommentDto {
    // Same mapper as the REST/`getReview` path (CS-22: so the relative anchors can't drift between them).
    return { ...toCommentDto(comment), correction: { id: correction.id, status: correction.status, assigneeId: correction.assigneeId } };
  }

  private toDto(c: CorrectionRow): CorrectionDto {
    return {
      id: c.id,
      pageId: c.pageId,
      assetId: c.assetId,
      type: c.type,
      anchor: c.anchor as CorrectionDto['anchor'],
      caseRef: c.caseRef,
      description: c.description,
      status: c.status,
      authorId: c.authorId,
      authorName: c.author.displayName,
      assigneeId: c.assigneeId,
      filedAgainstVersion: c.filedAgainstVersion,
      resolvedInVersion: c.resolvedInVersion,
      resolvedById: c.resolvedById ?? null,
      resolvedByName: c.resolvedBy?.displayName ?? null,
      verifiedAt: c.verifiedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}

/**
 * CS-10 — every correction WRITE additionally requires the group « Corrections » permission (the
 * prototype draws the toggle; a toggle that gates nothing would be a lie). Reads stay member-gated.
 * Owner / leader / co-leader always pass.
 */
function assertCanCorrect(page: LoadedPage, accountId: string): void {
  if (!hasGroupPermission(page.project, accountId, 'corrections')) {
    throw new ForbiddenException("Vous n'avez pas la permission « Corrections » sur ce projet.");
  }
}

const SURFACE_BY_TYPE: Record<string, 'scenario' | 'dessin'> = {
  scenario: 'scenario',
  texte: 'scenario',
  dessin: 'dessin',
  page: 'dessin',
};
function surfaceOf(type: string): 'scenario' | 'dessin' | null {
  return SURFACE_BY_TYPE[type] ?? null;
}

function statusLabel(status: CorrectionStatus): string {
  return status === 'a_corriger' ? 'À corriger' : status === 'en_cours' ? 'En cours' : 'Corrigé';
}

function short(text: string): string {
  const t = text.trim();
  return t.length > 40 ? `${t.slice(0, 37)}…` : t;
}
