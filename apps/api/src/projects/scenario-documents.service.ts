import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssetItem,
  AutosaveDocumentRequest,
  AutosaveDocumentResponse,
  CaseCommentDto,
  CaseSummary,
  CreateCaseCommentRequest,
  DeleteCaseCommentResponse,
  EditorDocumentResponse,
  EditorTemplate,
  PlancheDocJson,
  SharePageResponse,
  SnapshotVersionRequest,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import { AssetsService } from './assets.service';
import { EditorGateway } from './editor.gateway';
import { toCommentDto, type CommentRow } from './comment-mapper';
import { isMemberOf } from './projects.service';
import { assertCanWrite } from './members.service';

const HTML = 'text/html';

function webOrigin(): string {
  return (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000').split(',')[0]!.trim();
}

/** URL-safe slug for the in-app scenario filename (create-when-none). */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'scenario'
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

/** True when the editor HTML carries no visible content — empty string, whitespace, or empty
 *  paragraphs (`<p></p>`, `<p><br></p>`, `<p>&nbsp;</p>`). Guards create-when-none materialize so a
 *  stray on-mount/initial save (fired before the Yjs doc is populated) never burns v1 on an empty
 *  document — the classic "v1 empty / real content lands in v2" off-by-one. */
function isBlankHtml(html: string): boolean {
  return (html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, '').trim() === '';
}

/** Convert plain text (.txt asset) into paragraph HTML for the editor seed (blank lines split paragraphs). */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

/** Recursively collect plain text from a TipTap node projection. */
function plainText(node: unknown): string {
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n?.text === 'string') return n.text;
  if (Array.isArray(n?.content)) return n.content.map(plainText).join('');
  return '';
}

/** Project the stored PlancheDoc JSON to the story-shaped cases[] (the PUB-1-exploitable artifact). */
function deriveCases(contentJson: PlancheDocJson | null): CaseSummary[] {
  const content = (contentJson as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(content)) return [];
  const cases: CaseSummary[] = [];
  let i = 0;
  for (const block of content) {
    const b = block as { type?: string; attrs?: { no?: number }; content?: unknown[] };
    if (b?.type !== 'caseBlock') continue;
    i += 1;
    const children = Array.isArray(b.content) ? b.content : [];
    const description = children.filter((c) => (c as { type?: string }).type === 'caseDescription').map(plainText).join('\n');
    const dialogue = children.filter((c) => (c as { type?: string }).type === 'caseDialogue').map(plainText).join('\n');
    cases.push({ no: b.attrs?.no ?? i, description, dialogue });
  }
  return cases;
}

type LinkedAsset = { id: string; filename: string; currentVersion: number };

// CS-10 — every editor WRITE additionally requires « Écriture »; membership alone is not enough.
// Reads and comments stay member-gated (a comment is a separate affordance, not « Écriture »).
// `assertCanWrite` now lives in members.service.ts — one definition shared with the CS-3 asset routes.

/**
 * CS-4 collaborative script editor — the working-draft store (ScenarioDocument) bound 1:1 to a CS-3
 * `scenario` asset. Autosave writes the draft IN PLACE (never bumps the version); the explicit
 * "new version" action snapshots a CS-3 AssetVersion. Every route is member-gated (page → project →
 * member); non-member/absent → 404, no existence leak (CS-3 pattern). The API never decodes CRDT bytes.
 */
@Injectable()
export class ScenarioDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly assets: AssetsService,
    private readonly gateway: EditorGateway,
    private readonly s3: S3StorageService,
  ) {}

  async getDocument(accountId: string, pageId: string, assetId?: string): Promise<EditorDocumentResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const { plancheNo, total } = await this.derivePlanche(page);
    const asset = await this.resolveEditorAsset(page, assetId);

    let contentJson: PlancheDocJson | null = null;
    let ydocState: string | null = null;
    let documentId: string | null = null;
    let initialHtml: string | null = null;
    let comments: CaseCommentDto[] = [];
    let template: EditorTemplate | null = null;

    if (asset) {
      const doc = await this.prisma.scenarioDocument.findUnique({
        where: { assetId: asset.id },
        select: {
          id: true,
          contentJson: true,
          ydocState: true,
          template: true,
          comments: {
            include: { author: { select: { displayName: true } }, correction: { select: { id: true, status: true, assigneeId: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (doc) {
        contentJson = doc.contentJson as PlancheDocJson;
        // F-I7 — ship the persisted CRDT bytes on the initial load so the client can hydrate the Yjs
        // doc BEFORE the editor binds (deterministic; no empty-default caseBlock racing the WS sync).
        ydocState = doc.ydocState && doc.ydocState.length > 0 ? Buffer.from(doc.ydocState).toString('base64') : null;
        documentId = doc.id;
        template = (doc.template as EditorTemplate) ?? 'manga';
        comments = doc.comments.map((c) => this.toCommentDto(c as never));
      } else {
        // Asset exists but was never opened in the editor: seed from its current blob (.txt/.docx).
        initialHtml = await this.assetInitialHtml(accountId, asset.id);
      }
    }

    return {
      pageId: page.id,
      pageTitle: page.title,
      plancheNo,
      total,
      project: { slug: page.project.slug, title: page.project.title },
      chapter: page.chapter ? { id: page.chapter.id, number: page.chapter.number, title: page.chapter.title } : null,
      asset: asset ? { id: asset.id, filename: asset.filename, currentVersion: asset.currentVersion } : null,
      documentId,
      ydocState,
      contentJson,
      initialHtml,
      cases: deriveCases(contentJson),
      comments,
      template,
    };
  }

  async autosave(accountId: string, pageId: string, body: AutosaveDocumentRequest, assetId?: string): Promise<AutosaveDocumentResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    assertCanWrite(page.project, accountId);
    const ydoc = Buffer.from(body.ydocState, 'base64');
    const asset = await this.resolveEditorAsset(page, assetId);
    // Item 20/26 — persist the chosen scheme in place. `undefined` (older client) leaves it untouched
    // on update, and defaults to 'manga' at create.
    const template = body.template;

    if (asset) {
      // Edit-existing (or a subsequent autosave): update the draft in place; NEVER touch AssetVersion.
      const existing = await this.prisma.scenarioDocument.findUnique({ where: { assetId: asset.id }, select: { id: true } });
      if (existing) {
        await this.prisma.$transaction([
          this.prisma.scenarioDocument.update({
            where: { id: existing.id },
            data: { ydocState: ydoc, contentJson: body.contentJson as never, ...(template ? { template } : {}) },
          }),
          this.prisma.scenarioUpdate.deleteMany({ where: { documentId: existing.id } }),
        ]);
      } else {
        await this.prisma.scenarioDocument.create({ data: { assetId: asset.id, ydocState: ydoc, contentJson: body.contentJson as never, ...(template ? { template } : {}) } });
      }
      return { savedAt: new Date().toISOString(), materialized: null };
    }

    // Create-when-none: materialize a scenario asset from the draft HTML, link it to the card, seed the doc.
    // Guard: NEVER materialize an empty document. A stray on-mount/initial save (before the imported
    // initialHtml / typed content reaches the Yjs doc) would otherwise create an empty v1 and shift the
    // real first content into v2. Skip; the next save with real content materializes v1 correctly.
    if (isBlankHtml(body.html)) return { savedAt: new Date().toISOString(), materialized: null };
    const media = await this.media.ingestAsset(accountId, Buffer.from(body.html, 'utf8'), HTML);
    const filename = await this.uniqueScenarioFilename(page.projectId, page.title);
    const created = await this.assets.createAsset(accountId, page.project.slug, { mediaId: media.id, filename, type: 'scenario' });
    await this.assets.linkToPage(accountId, created.id, { pageId, type: 'scenario' });
    const doc = await this.prisma.scenarioDocument.create({ data: { assetId: created.id, ydocState: ydoc, contentJson: body.contentJson as never, ...(template ? { template } : {}) } });

    this.gateway.emitMaterialized(pageId, created.id); // pre-materialization clients rejoin the asset room
    return { savedAt: new Date().toISOString(), materialized: { assetId: created.id, filename: created.filename, documentId: doc.id } };
  }

  async snapshotVersion(accountId: string, pageId: string, body: SnapshotVersionRequest, assetId?: string): Promise<AssetItem> {
    const page = await this.resolveMemberPage(accountId, pageId);
    assertCanWrite(page.project, accountId);
    const asset = await this.resolveEditorAsset(page, assetId);
    if (!asset) throw new BadRequestException('Aucun scénario à versionner');
    // Fb-6 — dedupe guard: autosave writes the draft in place but does NOT bump the head; a re-click of
    // "Enregistrer une nouvelle version" without edits would otherwise clone the head (V3 == V4). If this
    // snapshot's bytes equal the current head version's (only comparable when the head is text/html — an
    // imported .docx/.txt head is never byte-equal to editor HTML), create nothing and return the head.
    if (await this.snapshotEqualsHead(asset, body.html)) return this.assets.getAssetItem(asset.id);
    const media = await this.media.ingestAsset(accountId, Buffer.from(body.html, 'utf8'), HTML);
    // Item 22 — carry the optional note onto the AssetVersion (omit the key entirely when absent).
    const note = body.note?.trim();
    return this.assets.addVersion(accountId, page.project.slug, asset.id, { mediaId: media.id, ...(note ? { note } : {}) });
  }

  async addComment(accountId: string, pageId: string, caseNo: number, body: CreateCaseCommentRequest, assetId?: string): Promise<CaseCommentDto> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const text = (body.text ?? '').trim();
    if (!text) throw new BadRequestException('Le commentaire ne peut pas être vide');
    const asset = await this.resolveEditorAsset(page, assetId);
    const doc = asset ? await this.prisma.scenarioDocument.findUnique({ where: { assetId: asset.id }, select: { id: true } }) : null;
    if (!doc) throw new BadRequestException("Enregistrez d'abord le scénario");

    // Item 5 — persist the optional highlighted-range anchor. A range needs both bounds AND from<to;
    // otherwise it's a plain case-level comment (nulls).
    const hasRange = typeof body.anchorFrom === 'number' && typeof body.anchorTo === 'number' && body.anchorFrom < body.anchorTo;
    const quote = body.quote?.trim();
    const created = await this.prisma.scenarioComment.create({
      data: {
        documentId: doc.id,
        caseNo,
        authorId: accountId,
        text,
        anchorFrom: hasRange ? body.anchorFrom! : null,
        anchorTo: hasRange ? body.anchorTo! : null,
        quote: hasRange && quote ? quote : null,
        // Fb-7 — stamp the version the comment was filed against (head at creation).
        version: asset?.currentVersion ?? null,
      },
      include: { author: { select: { displayName: true } }, correction: { select: { id: true, status: true, assigneeId: true } } },
    });
    const dto = this.toCommentDto(created as never);
    this.gateway.emitComment(asset!.id, dto);
    return dto;
  }

  /**
   * CS-15 — author-only delete of a scenario comment. Member-gated to reach the document (404, no leak);
   * 404 before 403 so a non-author probing a bogus/foreign id learns nothing (404), while probing a real
   * comment they don't own gets 403. On success the deletion fans out to peers over the /editor room.
   */
  async deleteComment(accountId: string, pageId: string, commentId: string, assetId?: string): Promise<DeleteCaseCommentResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const asset = await this.resolveEditorAsset(page, assetId);
    const doc = asset ? await this.prisma.scenarioDocument.findUnique({ where: { assetId: asset.id }, select: { id: true } }) : null;
    if (!doc) throw new NotFoundException('Commentaire introuvable');
    const comment = await this.prisma.scenarioComment.findFirst({ where: { id: commentId, documentId: doc.id }, select: { id: true, authorId: true } });
    if (!comment) throw new NotFoundException('Commentaire introuvable'); // unknown id, another document's comment, or a re-delete
    if (comment.authorId !== accountId) throw new ForbiddenException('Seul l’auteur peut supprimer ce commentaire');
    await this.prisma.scenarioComment.delete({ where: { id: commentId } });
    this.gateway.emitCommentDeleted(asset!.id, commentId);
    return { id: commentId };
  }

  async share(accountId: string, pageId: string): Promise<SharePageResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    return { url: `${webOrigin()}/projet/${page.project.slug}/editeur/${page.id}` };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Fb-6 — true when the editor snapshot html is byte-identical to the head AssetVersion's media (only
   *  compared when that media is text/html; a binary head is treated as always-different). */
  private async snapshotEqualsHead(asset: LinkedAsset, html: string): Promise<boolean> {
    const head = await this.prisma.assetVersion.findUnique({
      where: { assetId_version: { assetId: asset.id, version: asset.currentVersion } },
      select: { mediaId: true },
    });
    if (!head) return false;
    const media = await this.prisma.media.findUnique({ where: { id: head.mediaId }, select: { bucketKey: true, contentType: true } });
    if (!media || media.contentType !== HTML) return false;
    const headBytes = await this.s3.getObjectBuffer(media.bucketKey);
    return headBytes.equals(Buffer.from(html, 'utf8'));
  }

  /** Resolve page + membership; unknown OR non-member → 404 (no existence leak — editor is reachable
   *  only to members). */
  private async resolveMemberPage(accountId: string, pageId: string) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        title: true,
        projectId: true,
        chapterId: true,
        createdAt: true,
        // CS-10: the group columns ride along (mirrors pages.service.loadMemberPage) so the write
        // paths can gate on « Écriture » through the shared hasGroupPermission seam.
        project: {
          select: {
            id: true,
            slug: true,
            title: true,
            ownerId: true,
            work: { select: { creators: { select: { accountId: true, groupRole: true, permissions: true } } } },
          },
        },
        chapter: { select: { id: true, number: true, title: true } },
      },
    });
    if (!page || !isMemberOf(page.project as never, accountId)) throw new NotFoundException('Carte introuvable');
    return page as typeof page & {
      title: string;
      projectId: string;
      chapterId: string | null;
      createdAt: Date;
      project: { id: string; slug: string; title: string };
      chapter: { id: string; number: number; title: string } | null;
    };
  }

  /** plancheNo = 1-based position among chapter siblings (createdAt asc, id tie-break); total = count. */
  private async derivePlanche(page: { id: string; projectId: string; chapterId: string | null }): Promise<{ plancheNo: number; total: number }> {
    const siblings = await this.prisma.page.findMany({
      where: { projectId: page.projectId, chapterId: page.chapterId },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const idx = siblings.findIndex((s) => s.id === page.id);
    return { plancheNo: idx + 1, total: siblings.length };
  }

  /**
   * D9 — the ONE resolver shared by all editor entry points. With an explicit `assetId`, load that asset
   * and 404 (no leak) unless it belongs to the page's project AND is a `scenario`|`texte` type (opening a
   * CHOSEN file). Without it, fall back to the round-1 linked-scenario resolution. Membership is already
   * gated by the caller's `resolveMemberPage`.
   */
  private async resolveEditorAsset(page: { id: string; projectId: string }, assetId?: string): Promise<LinkedAsset | null> {
    if (!assetId) return this.findLinkedScenarioAsset(page.id);
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, projectId: page.projectId, type: { in: ['scenario', 'texte'] } },
      select: { id: true, filename: true, currentVersion: true },
    });
    if (!asset) throw new NotFoundException('Fichier introuvable');
    return asset as LinkedAsset;
  }

  /** First scenario link (createdAt asc); falls back to a texte link — mirrors the modal's Scénario section. */
  private async findLinkedScenarioAsset(pageId: string): Promise<LinkedAsset | null> {
    for (const type of ['scenario', 'texte'] as const) {
      const link = await this.prisma.assetPageLink.findFirst({
        where: { pageId, asset: { type } },
        orderBy: { createdAt: 'asc' },
        select: { asset: { select: { id: true, filename: true, currentVersion: true } } },
      });
      if (link) return link.asset as LinkedAsset;
    }
    return null;
  }

  /** `scenario-<title-slug>.html`, deduped `-2`, `-3`… against @@unique([projectId, filename]) so the
   *  createAsset re-import branch is never accidentally triggered (D5). */
  private async uniqueScenarioFilename(projectId: string, title: string): Promise<string> {
    const base = `scenario-${slugify(title)}`;
    for (let n = 1; ; n++) {
      const filename = n === 1 ? `${base}.html` : `${base}-${n}.html`;
      const taken = await this.prisma.asset.findUnique({ where: { projectId_filename: { projectId, filename } }, select: { id: true } });
      if (!taken) return filename;
    }
  }

  /** Seed HTML for an asset that exists but has no ScenarioDocument yet — reuses the CS-3 preview path
   *  (.txt → paragraphs, .docx → sanitized HTML derivative). */
  private async assetInitialHtml(accountId: string, assetId: string): Promise<string | null> {
    try {
      const preview = await this.assets.getPreview(accountId, assetId);
      if (preview.mode === 'text' && preview.text) return textToHtml(preview.text);
      if (preview.mode === 'html' && preview.html) return preview.html;
    } catch {
      // A missing/processing blob just means "start blank" — never fail the editor open.
    }
    return null;
  }

  private toCommentDto(c: CommentRow): CaseCommentDto {
    return toCommentDto(c);
  }
}
