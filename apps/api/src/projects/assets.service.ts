import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddAssetVersionRequest,
  AssetItem,
  AssetListQuery,
  AssetListResponse,
  AssetPreviewResponse,
  AssetType,
  AssetVersionItem,
  CreateAssetRequest,
  LinkAssetRequest,
} from '@encre-et-plume/shared';
import type { Prisma } from '@prisma/client';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import {
  ASSET_ALLOWED_CONTENT_TYPES,
  ASSET_SORTS,
  ASSET_TYPES,
  ASSETS_PAGE_SIZE,
  DRAWING_SOURCE_CONTENT_TYPES,
  DRAWING_SOURCE_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MULTI_LINK_ASSET_TYPES,
  PAGE_FILE_TAGS,
  PSD_CONTENT_TYPE,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService, sanitizeDocxHtml } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import { isMemberOf } from './projects.service';

const SIGNED_URL_TTL = () => Number(process.env['MEDIA_SIGNED_URL_TTL'] ?? 300);
const TEXT_PREVIEW_CAP = 500 * 1024; // 500 KB — small derived text payload

const ASSET_ALLOWED_SET = new Set<string>(ASSET_ALLOWED_CONTENT_TYPES);
const DRAWING_EXT_SET = new Set<string>(DRAWING_SOURCE_EXTENSIONS);
const DRAWING_CT_SET = new Set<string>(DRAWING_SOURCE_CONTENT_TYPES);
const ASSET_TYPE_SET = new Set<string>(ASSET_TYPES);
const ASSET_SORT_SET = new Set<string>(ASSET_SORTS);
const PAGE_TAG_SET = new Set<string>(PAGE_FILE_TAGS);
const MULTI_LINK_SET = new Set<string>(MULTI_LINK_ASSET_TYPES); // scenario/texte/ref → many cards

/** Include feeding AssetItem.linkedPages — every linked card in link order (createdAt asc). */
const ASSET_PAGE_LINKS_INCLUDE = {
  pageLinks: { include: { page: { select: { id: true, title: true } } }, orderBy: { createdAt: 'asc' } },
} as const;

type MediaRow = {
  id: string;
  ownerId: string;
  kind: string;
  status: string;
  contentType: string;
  size: number;
  bucketKey: string;
  visibility: string;
  variants: Record<string, string>;
};

/** D1: image (incl. .psd) or a drawing-source extension (.clip/.kra/.procreate/… — CS-3 2026-07-13) →
 *  dessin; a text/docx/pdf whose filename matches "scénario" → scenario, else texte. */
function deriveAssetType(contentType: string, filename: string): AssetType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (DRAWING_EXT_SET.has(ext)) return 'dessin';
  if (contentType.startsWith('image/')) return 'dessin';
  return /sc[eé]nario/i.test(filename) ? 'scenario' : 'texte';
}

/** D14: reject loopback / private / link-local / CGNAT ranges (IPv4 + IPv6) to block SSRF. */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // link-local
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7)); // IPv4-mapped
  return false;
}

/**
 * CS-3 project assets — versioned logical files backed by F-10 Media. Every route is member-gated
 * (owner or WorkCreator via isMemberOf, mirroring CS-2): unknown → 404, non-member public → 403,
 * non-member private → 404 (no existence leak). Bytes never flow through here — MediaService owns
 * storage; this service registers/versions/links/lists and resolves display URLs server-side.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly s3: S3StorageService,
  ) {}

  // ── B2: register (or D10 re-import → append version) ──────────────────────
  async createAsset(accountId: string, slug: string, body: CreateAssetRequest): Promise<AssetItem> {
    const project = await this.resolveMemberProject(accountId, slug);
    const filename = (body.filename ?? '').trim();
    if (!filename) throw new BadRequestException('Nom de fichier requis');
    if (filename.length > 255) throw new BadRequestException('Nom de fichier trop long');

    const media = await this.loadOwnReadyAssetMedia(accountId, body.mediaId);

    const existing = await this.prisma.asset.findUnique({
      where: { projectId_filename: { projectId: project.id, filename } },
    });
    if (existing) {
      return this.appendVersion(accountId, existing as { id: string; currentVersion: number }, media, body.note);
    }

    const type = body.type ?? deriveAssetType(media.contentType, filename); // B7: declared type overrides derivation
    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: { projectId: project.id, type: type as never, filename, currentVersion: 1, size: media.size, mediaId: media.id },
      });
      await tx.assetVersion.create({
        data: { assetId: (asset as { id: string }).id, version: 1, mediaId: media.id, size: media.size, note: body.note ?? null, authorId: accountId },
      });
      return asset as { id: string };
    });
    return this.getAssetItem(created.id);
  }

  // ── B3: import from a URL (SSRF-guarded server-side fetch) ────────────────
  async createFromUrl(accountId: string, slug: string, body: { url: string; filename?: string; type?: AssetType }): Promise<AssetItem> {
    // Gate BEFORE fetching — never fetch on behalf of a non-member.
    await this.resolveMemberProject(accountId, slug);
    const { buffer, contentType } = await this.fetchGuarded(body.url);
    const media = await this.media.ingestAsset(accountId, buffer, contentType);
    const filename = (body.filename ?? lastPathSegment(body.url)).trim() || 'fichier';
    return this.createAsset(accountId, slug, { mediaId: media.id, filename, type: body.type });
  }

  /** D14: http(s) only; DNS-resolve + IP-range check every hop; ≤3 redirects; hard byte cap; allowlist. */
  private async fetchGuarded(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    let current = url;
    for (let hop = 0; hop <= 3; hop++) {
      await this.assertSafeUrl(current);
      const res = await fetch(current, { redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new BadRequestException('Redirection invalide');
        current = new URL(location, current).toString();
        continue;
      }
      const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      if (!ASSET_ALLOWED_SET.has(contentType)) throw new BadRequestException('Format non pris en charge');
      const buffer = await readCapped(res, MAX_UPLOAD_BYTES);
      return { buffer, contentType };
    }
    throw new BadRequestException('Trop de redirections');
  }

  private async assertSafeUrl(url: string): Promise<void> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new BadRequestException('URL invalide');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadRequestException('URL non autorisée');
    const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (isIP(host)) {
      if (isPrivateIp(host)) throw new BadRequestException('URL non autorisée');
      return;
    }
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) if (isPrivateIp(a.address)) throw new BadRequestException('URL non autorisée');
  }

  // ── B5: add a new version of an existing asset ────────────────────────────
  async addVersion(accountId: string, slug: string, assetId: string, body: AddAssetVersionRequest): Promise<AssetItem> {
    const project = await this.resolveMemberProject(accountId, slug);
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, projectId: project.id } });
    if (!asset) throw new NotFoundException('Fichier introuvable');
    const media = await this.loadOwnReadyAssetMedia(accountId, body.mediaId);
    return this.appendVersion(accountId, asset as { id: string; currentVersion: number }, media, body.note);
  }

  private async appendVersion(
    accountId: string,
    asset: { id: string; currentVersion: number },
    media: MediaRow,
    note?: string,
  ): Promise<AssetItem> {
    const nextVersion = asset.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.assetVersion.create({
        data: { assetId: asset.id, version: nextVersion, mediaId: media.id, size: media.size, note: note ?? null, authorId: accountId },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { currentVersion: nextVersion, mediaId: media.id, size: media.size },
      });
    });
    return this.getAssetItem(asset.id);
  }

  // ── set the active/current version (repoints the Asset head; does NOT create a version) ──
  async setActiveVersion(accountId: string, assetId: string, version: number): Promise<AssetItem> {
    const asset = await this.loadMemberAsset(accountId, assetId);
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Version invalide');
    if (version === asset.currentVersion) return this.getAssetItem(assetId); // idempotent no-op
    const target = (await this.prisma.assetVersion.findUnique({
      where: { assetId_version: { assetId, version } },
    })) as { mediaId: string; size: number } | null;
    if (!target) throw new NotFoundException('Version introuvable');
    // Repoint the denormalized head: currentVersion drives linkedFiles[].version, the "⎘ vN" badge,
    // the preview (getPreview signs asset.mediaId), and the Fichiers grid.
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { currentVersion: version, mediaId: target.mediaId, size: target.size },
    });
    return this.getAssetItem(assetId);
  }

  // ── B6: version chain ─────────────────────────────────────────────────────
  async getVersions(accountId: string, assetId: string): Promise<AssetVersionItem[]> {
    const asset = await this.loadMemberAsset(accountId, assetId);
    const rows = await this.prisma.assetVersion.findMany({
      where: { assetId },
      orderBy: { version: 'desc' },
      include: { author: { select: { displayName: true } } },
    });
    const mediaRows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(rows.map((r) => (r as { mediaId: string }).mediaId))] } },
    });
    const mediaById = new Map(mediaRows.map((m) => [(m as unknown as MediaRow).id, m as unknown as MediaRow]));
    return Promise.all(
      rows.map(async (r) => {
        const row = r as unknown as {
          version: number; mediaId: string; size: number; note: string | null;
          authorId: string; createdAt: Date; author: { displayName: string };
        };
        return {
          version: row.version,
          mediaId: row.mediaId,
          size: row.size,
          note: row.note,
          authorId: row.authorId,
          authorName: row.author.displayName,
          createdAt: row.createdAt.toISOString(),
          thumbnailUrl: await this.resolveThumb(mediaById.get(row.mediaId)),
          active: row.version === asset.currentVersion,
        };
      }),
    );
  }

  // ── link asset → card (2026-07-14: scenario/texte/ref = many cards; dessin/page = one; B8 re-type) ──
  async linkToPage(accountId: string, assetId: string, body: LinkAssetRequest): Promise<AssetItem> {
    const asset = await this.loadMemberAsset(accountId, assetId);
    const page = await this.prisma.page.findUnique({
      where: { id: body.pageId },
      select: { id: true, projectId: true, linkedFileIds: true, fileTags: true },
    });
    if (!page || page.projectId !== asset.projectId) throw new BadRequestException('Carte invalide');

    const oldType = asset.type;
    const nextType = body.type ?? oldType; // B8: section-scoped link re-types the asset
    // Cardinality is decided on the POST-re-type type: dessin/page always replace all other links
    // ("re-link replaces"), scenario/texte/ref add (idempotent). D-ML1: no rejection path.
    const isSingleCard = !MULTI_LINK_SET.has(nextType);
    const alreadyLinkedHere = asset.pageLinks.some((l) => l.pageId === body.pageId);
    const otherPageIds = asset.pageLinks.filter((l) => l.pageId !== body.pageId).map((l) => l.pageId);
    const keptOtherPageIds = isSingleCard ? [] : otherPageIds;

    await this.prisma.$transaction(async (tx) => {
      // Re-type FIRST, so type-based prune counts already reflect the new type on every touched card.
      if (nextType !== oldType) {
        await tx.asset.update({ where: { id: assetId }, data: { type: nextType } });
      }

      // Single-card types replace: drop every other link, pruning each old card by the OLD type.
      if (isSingleCard) {
        for (const otherId of otherPageIds) {
          await tx.assetPageLink.delete({ where: { assetId_pageId: { assetId, pageId: otherId } } });
          await this.detachFromPage(tx, otherId, assetId, oldType);
        }
      }

      // Add this card's link (idempotent — same-page re-link is a no-op via skipDuplicates).
      await tx.assetPageLink.createMany({ data: [{ assetId, pageId: body.pageId }], skipDuplicates: true });

      // Target-card fileTags: on same-page re-classification prune the old chip; then add the new chip.
      let fileTags = page.fileTags;
      if (alreadyLinkedHere && nextType !== oldType && PAGE_TAG_SET.has(oldType) && fileTags.includes(oldType)) {
        // asset.type is now nextType → this count only sees OTHER linked assets of the old type.
        const stillJustified = await tx.asset.count({ where: { id: { in: page.linkedFileIds }, type: oldType } });
        if (stillJustified === 0) fileTags = fileTags.filter((t) => t !== oldType);
      }
      if (PAGE_TAG_SET.has(nextType) && !fileTags.includes(nextType)) {
        fileTags = [...fileTags, nextType];
      }

      const linkedFileIds = page.linkedFileIds.includes(assetId) ? page.linkedFileIds : [...page.linkedFileIds, assetId];
      const data: Record<string, unknown> = { linkedFileIds };
      if (fileTags !== page.fileTags) data.fileTags = fileTags;
      await tx.page.update({ where: { id: body.pageId }, data });

      // Re-type ripple (A6): the asset's stored type changed for EVERY card it stays linked to, so
      // reconcile chips on the OTHER still-linked cards (shared types keep them).
      if (nextType !== oldType) {
        for (const otherId of keptOtherPageIds) {
          await this.reconcileRetypeTags(tx, otherId, assetId, oldType, nextType);
        }
      }
    });
    return this.getAssetItem(assetId);
  }

  // ── per-card unlink (2026-07-14: removes just this card's link; idempotent) ──
  async unlinkFromPage(accountId: string, assetId: string, pageId: string): Promise<AssetItem> {
    if (!pageId) throw new BadRequestException('pageId requis');
    const asset = await this.loadMemberAsset(accountId, assetId);
    if (!asset.pageLinks.some((l) => l.pageId === pageId)) return this.getAssetItem(assetId); // idempotent no-op
    await this.prisma.$transaction(async (tx) => {
      await tx.assetPageLink.delete({ where: { assetId_pageId: { assetId, pageId } } });
      await this.detachFromPage(tx, pageId, assetId, asset.type);
    });
    return this.getAssetItem(assetId);
  }

  // ── delete an asset + ALL its links + its version chain + F-10 blobs ───────
  async deleteAsset(accountId: string, assetId: string): Promise<void> {
    const asset = await this.loadMemberAsset(accountId, assetId);
    const versions = await this.prisma.assetVersion.findMany({ where: { assetId }, select: { mediaId: true } });
    const mediaIds = [...new Set(versions.map((v) => (v as { mediaId: string }).mediaId))];
    await this.prisma.$transaction(async (tx) => {
      // A7: detach every linked card (linkedFileIds + chip prune) before the row cascades.
      for (const { pageId } of asset.pageLinks) await this.detachFromPage(tx, pageId, assetId, asset.type);
      await tx.asset.delete({ where: { id: assetId } }); // AssetVersion + AssetPageLink cascade (onDelete: Cascade)
    });
    // D-J: best-effort immediate blob cleanup — never fail the request on an S3/Media hiccup.
    for (const id of mediaIds) await this.media.deleteMediaById(id).catch(() => {});
  }

  /** Detach `assetId` from `pageId`: drop it from linkedFileIds and prune the `oldType` file-tag chip
   *  iff no remaining linked asset still justifies it. Shared by link-replace / unlink / delete. */
  private async detachFromPage(tx: Prisma.TransactionClient, pageId: string, assetId: string, oldType: AssetType): Promise<void> {
    const old = await tx.page.findUnique({ where: { id: pageId }, select: { linkedFileIds: true, fileTags: true } });
    if (!old) return;
    const remaining = (old.linkedFileIds as string[]).filter((x) => x !== assetId);
    const data: Record<string, unknown> = { linkedFileIds: remaining };
    if (PAGE_TAG_SET.has(oldType) && (old.fileTags as string[]).includes(oldType)) {
      const stillJustified = await tx.asset.count({ where: { id: { in: remaining }, type: oldType } });
      if (stillJustified === 0) data.fileTags = (old.fileTags as string[]).filter((t) => t !== oldType);
    }
    await tx.page.update({ where: { id: pageId }, data });
  }

  /** Re-type ripple helper: the asset STAYS linked to `pageId` but its type changed old→next. Prune
   *  the old chip iff no remaining linked asset of the old type justifies it, add the new chip. Only
   *  writes when a chip actually changes. */
  private async reconcileRetypeTags(tx: Prisma.TransactionClient, pageId: string, assetId: string, oldType: AssetType, nextType: AssetType): Promise<void> {
    const p = await tx.page.findUnique({ where: { id: pageId }, select: { linkedFileIds: true, fileTags: true } });
    if (!p) return;
    let fileTags = p.fileTags as string[];
    if (PAGE_TAG_SET.has(oldType) && fileTags.includes(oldType)) {
      // asset.type is already nextType in this tx → count sees only OTHER old-type assets.
      const stillJustified = await tx.asset.count({ where: { id: { in: p.linkedFileIds as string[] }, type: oldType } });
      if (stillJustified === 0) fileTags = fileTags.filter((t) => t !== oldType);
    }
    if (PAGE_TAG_SET.has(nextType) && !fileTags.includes(nextType)) fileTags = [...fileTags, nextType];
    if (fileTags !== (p.fileTags as string[])) await tx.page.update({ where: { id: pageId }, data: { fileTags } });
  }

  // ── B4: paginated, filterable list ────────────────────────────────────────
  async list(accountId: string, slug: string, query: AssetListQuery): Promise<AssetListResponse> {
    const project = await this.resolveMemberProject(accountId, slug);

    if (query.type && !ASSET_TYPE_SET.has(query.type)) throw new BadRequestException('Type invalide');
    if (query.sort && !ASSET_SORT_SET.has(query.sort)) throw new BadRequestException('Tri invalide');

    const where: Record<string, unknown> = { projectId: project.id };
    if (query.type) where.type = query.type;
    if (query.pageId) where.pageLinks = { some: { pageId: query.pageId } }; // via the join (@@index([pageId]))
    if (query.q) where.filename = { contains: query.q, mode: 'insensitive' };

    const orderBy =
      query.sort === 'name' ? { filename: 'asc' as const } : query.sort === 'size' ? { size: 'desc' as const } : { updatedAt: 'desc' as const };

    const page = Math.max(1, query.page ?? 1);
    const total = await this.prisma.asset.count({ where });
    const rows = await this.prisma.asset.findMany({
      where,
      orderBy,
      skip: (page - 1) * ASSETS_PAGE_SIZE,
      take: ASSETS_PAGE_SIZE,
      include: ASSET_PAGE_LINKS_INCLUDE,
    });

    const mediaRows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(rows.map((r) => (r as { mediaId: string }).mediaId))] } },
    });
    const mediaById = new Map(mediaRows.map((m) => [(m as unknown as MediaRow).id, m as unknown as MediaRow]));

    const items = await Promise.all(rows.map((r) => this.toAssetItem(r as never, mediaById.get((r as { mediaId: string }).mediaId))));
    return { items, total, page, pageSize: ASSETS_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / ASSETS_PAGE_SIZE)) };
  }

  // ── B7: inline preview payload ────────────────────────────────────────────
  async getPreview(accountId: string, assetId: string): Promise<AssetPreviewResponse> {
    const asset = await this.loadMemberAsset(accountId, assetId);
    const media = (await this.prisma.media.findUnique({ where: { id: asset.mediaId } })) as unknown as MediaRow | null;
    const downloadUrl = (await this.media.signedUrl(accountId, asset.mediaId)).url;
    const base = { downloadUrl, filename: asset.filename, version: asset.currentVersion };
    if (!media) return { mode: 'unavailable', ...base };

    const ct = media.contentType;
    if (ct.startsWith('image/') && ct !== PSD_CONTENT_TYPE) {
      return { mode: 'image', url: await this.signVariant(media, 'web'), ...base };
    }
    if (ct === 'application/pdf') {
      return { mode: 'pdf', url: downloadUrl, ...base }; // stored inline-disposition (D6)
    }
    if (ct === 'text/plain') {
      const buf = await this.s3.getObjectBuffer(media.bucketKey);
      if (buf.length > TEXT_PREVIEW_CAP) return { mode: 'unavailable', ...base };
      return { mode: 'text', text: buf.toString('utf8'), ...base };
    }
    // CS-4: in-app scenario HTML — previewed inline but ALWAYS through the docx sanitizer, never raw (D11).
    if (ct === 'text/html') {
      const buf = await this.s3.getObjectBuffer(media.bucketKey);
      if (buf.length > TEXT_PREVIEW_CAP) return { mode: 'unavailable', ...base };
      return { mode: 'html', html: sanitizeDocxHtml(buf.toString('utf8')), ...base };
    }
    // psd + drawing-source formats: proprietary/binary → download-only, no inline viewer (CS-3).
    if (ct === PSD_CONTENT_TYPE || DRAWING_CT_SET.has(ct)) return { mode: 'unavailable', ...base };
    // docx (and any other document): preview HTML derivative or "processing"
    const previewKey = media.variants?.preview;
    if (!previewKey) return { mode: 'processing', ...base };
    const html = (await this.s3.getObjectBuffer(previewKey)).toString('utf8');
    return { mode: 'html', html, ...base };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async getAssetItem(assetId: string): Promise<AssetItem> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: ASSET_PAGE_LINKS_INCLUDE,
    });
    const media = (await this.prisma.media.findUnique({ where: { id: (asset as { mediaId: string }).mediaId } })) as unknown as MediaRow | null;
    return this.toAssetItem(asset as never, media ?? undefined);
  }

  private async toAssetItem(
    asset: { id: string; type: AssetType; filename: string; currentVersion: number; size: number; updatedAt: Date; pageLinks: { page: { id: string; title: string } }[] },
    media: MediaRow | undefined,
  ): Promise<AssetItem> {
    const ct = media?.contentType ?? '';
    return {
      id: asset.id,
      type: asset.type,
      filename: asset.filename,
      currentVersion: asset.currentVersion,
      size: asset.size,
      thumbnailUrl: await this.resolveThumb(media),
      // Not previewable: psd, drawing-source formats (octet-stream / format-specific), and unknown.
      previewable: ct !== '' && ct !== PSD_CONTENT_TYPE && !DRAWING_CT_SET.has(ct),
      // 2026-07-14: all cards this asset links to, in link order (createdAt asc); [] when unlinked.
      linkedPages: (asset.pageLinks ?? []).map((pl) => pl.page).filter((p): p is { id: string; title: string } => Boolean(p)),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  /** Thumbnail from the media's `thumb` variant — public → as stored, private → short-lived signed;
   *  documents/psd have no thumb variant → null (FE renders a placeholder tile). */
  private async resolveThumb(media: MediaRow | undefined): Promise<string | null> {
    const key = media?.variants?.thumb;
    if (!media || !key) return null;
    if (media.visibility === 'public') return key;
    return this.s3.presignGet(key, SIGNED_URL_TTL());
  }

  /** Sign a variant key (fall back to `orig`); public media returns the stored URL as-is. */
  private async signVariant(media: MediaRow, variant: 'web' | 'orig'): Promise<string> {
    const key = media.variants?.[variant] ?? media.variants?.orig ?? media.bucketKey;
    if (media.visibility === 'public') return key;
    return this.s3.presignGet(key, SIGNED_URL_TTL());
  }

  private async loadOwnReadyAssetMedia(accountId: string, mediaId: string): Promise<MediaRow> {
    const media = (await this.prisma.media.findUnique({ where: { id: mediaId } })) as unknown as MediaRow | null;
    if (!media || media.ownerId !== accountId) throw new BadRequestException('Média introuvable');
    if (media.kind !== 'asset') throw new BadRequestException("Le média n'est pas un fichier de projet");
    if (media.status !== 'ready') throw new BadRequestException("Le fichier n'est pas encore prêt");
    return media;
  }

  private async resolveMemberProject(accountId: string, slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: { work: { include: { creators: { select: { accountId: true } } } } },
    });
    if (!project || !project.work) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project, accountId)) {
      if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  /** Load an asset with its project membership context + current link set (for the /assets/:id routes). */
  private async loadMemberAsset(accountId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        project: { include: { work: { include: { creators: { select: { accountId: true } } } } } },
        pageLinks: { select: { pageId: true } },
      },
    });
    if (!asset) throw new NotFoundException('Fichier introuvable');
    const project = (asset as unknown as { project: { ownerId: string; visibility: string; work: { creators: { accountId: string }[] } | null } }).project;
    if (!isMemberOf(project, accountId)) {
      if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
      throw new NotFoundException('Fichier introuvable');
    }
    return asset as unknown as { id: string; projectId: string; type: AssetType; filename: string; currentVersion: number; mediaId: string; pageLinks: { pageId: string }[] };
  }
}

/** Last decoded path segment of a URL → default filename for from-url imports. */
function lastPathSegment(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
  } catch {
    return '';
  }
}

/** Stream-read a fetch Response with a hard byte cap (aborts once exceeded). */
async function readCapped(res: Response, cap: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        throw new BadRequestException('Fichier trop volumineux (max 10 Mo)');
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}
