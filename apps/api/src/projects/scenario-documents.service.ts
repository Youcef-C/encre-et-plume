import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssetItem,
  AutosaveDocumentRequest,
  AutosaveDocumentResponse,
  CaseCommentDto,
  CaseSummary,
  CreateCaseCommentRequest,
  EditorDocumentResponse,
  PlancheDocJson,
  SharePageResponse,
  SnapshotVersionRequest,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { AssetsService } from './assets.service';
import { EditorGateway } from './editor.gateway';
import { isMemberOf } from './projects.service';

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
  ) {}

  async getDocument(accountId: string, pageId: string, assetId?: string): Promise<EditorDocumentResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const { plancheNo, total } = await this.derivePlanche(page);
    const asset = await this.resolveEditorAsset(page, assetId);

    let contentJson: PlancheDocJson | null = null;
    let documentId: string | null = null;
    let initialHtml: string | null = null;
    let comments: CaseCommentDto[] = [];

    if (asset) {
      const doc = await this.prisma.scenarioDocument.findUnique({
        where: { assetId: asset.id },
        select: {
          id: true,
          contentJson: true,
          comments: { include: { author: { select: { displayName: true } } }, orderBy: { createdAt: 'asc' } },
        },
      });
      if (doc) {
        contentJson = doc.contentJson as PlancheDocJson;
        documentId = doc.id;
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
      contentJson,
      initialHtml,
      cases: deriveCases(contentJson),
      comments,
    };
  }

  async autosave(accountId: string, pageId: string, body: AutosaveDocumentRequest, assetId?: string): Promise<AutosaveDocumentResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const ydoc = Buffer.from(body.ydocState, 'base64');
    const asset = await this.resolveEditorAsset(page, assetId);

    if (asset) {
      // Edit-existing (or a subsequent autosave): update the draft in place; NEVER touch AssetVersion.
      const existing = await this.prisma.scenarioDocument.findUnique({ where: { assetId: asset.id }, select: { id: true } });
      if (existing) {
        await this.prisma.$transaction([
          this.prisma.scenarioDocument.update({ where: { id: existing.id }, data: { ydocState: ydoc, contentJson: body.contentJson as never } }),
          this.prisma.scenarioUpdate.deleteMany({ where: { documentId: existing.id } }),
        ]);
      } else {
        await this.prisma.scenarioDocument.create({ data: { assetId: asset.id, ydocState: ydoc, contentJson: body.contentJson as never } });
      }
      return { savedAt: new Date().toISOString(), materialized: null };
    }

    // Create-when-none: materialize a scenario asset from the draft HTML, link it to the card, seed the doc.
    const media = await this.media.ingestAsset(accountId, Buffer.from(body.html, 'utf8'), HTML);
    const filename = await this.uniqueScenarioFilename(page.projectId, page.title);
    const created = await this.assets.createAsset(accountId, page.project.slug, { mediaId: media.id, filename, type: 'scenario' });
    await this.assets.linkToPage(accountId, created.id, { pageId, type: 'scenario' });
    const doc = await this.prisma.scenarioDocument.create({ data: { assetId: created.id, ydocState: ydoc, contentJson: body.contentJson as never } });

    this.gateway.emitMaterialized(pageId, created.id); // pre-materialization clients rejoin the asset room
    return { savedAt: new Date().toISOString(), materialized: { assetId: created.id, filename: created.filename, documentId: doc.id } };
  }

  async snapshotVersion(accountId: string, pageId: string, body: SnapshotVersionRequest, assetId?: string): Promise<AssetItem> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const asset = await this.resolveEditorAsset(page, assetId);
    if (!asset) throw new BadRequestException('Aucun scénario à versionner');
    const media = await this.media.ingestAsset(accountId, Buffer.from(body.html, 'utf8'), HTML);
    return this.assets.addVersion(accountId, page.project.slug, asset.id, { mediaId: media.id });
  }

  async addComment(accountId: string, pageId: string, caseNo: number, body: CreateCaseCommentRequest, assetId?: string): Promise<CaseCommentDto> {
    const page = await this.resolveMemberPage(accountId, pageId);
    const text = (body.text ?? '').trim();
    if (!text) throw new BadRequestException('Le commentaire ne peut pas être vide');
    const asset = await this.resolveEditorAsset(page, assetId);
    const doc = asset ? await this.prisma.scenarioDocument.findUnique({ where: { assetId: asset.id }, select: { id: true } }) : null;
    if (!doc) throw new BadRequestException("Enregistrez d'abord le scénario");

    const created = await this.prisma.scenarioComment.create({
      data: { documentId: doc.id, caseNo, authorId: accountId, text },
      include: { author: { select: { displayName: true } } },
    });
    const dto = this.toCommentDto(created as never);
    this.gateway.emitComment(asset!.id, dto);
    return dto;
  }

  async share(accountId: string, pageId: string): Promise<SharePageResponse> {
    const page = await this.resolveMemberPage(accountId, pageId);
    return { url: `${webOrigin()}/projet/${page.project.slug}/editeur/${page.id}` };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

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
        project: { select: { id: true, slug: true, title: true, ownerId: true, work: { select: { creators: { select: { accountId: true } } } } } },
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

  private toCommentDto(c: { id: string; caseNo: number; authorId: string; text: string; createdAt: Date; author: { displayName: string } }): CaseCommentDto {
    return { id: c.id, caseNo: c.caseNo, authorId: c.authorId, authorName: c.author.displayName, text: c.text, createdAt: c.createdAt.toISOString() };
  }
}
