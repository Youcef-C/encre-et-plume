import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  AssetItem,
  AssetListResponse,
  AssetPreviewResponse,
  AssetSort,
  AssetType,
  AssetVersionItem,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { AssetsService } from './assets.service';
import { AddAssetVersionDto, CreateAssetDto, CreateAssetFromUrlDto, LinkAssetDto, SetActiveVersionDto } from './dto/asset.dto';

/**
 * CS-3 project asset routes. Project-scoped routes live under /projects/:slug/assets (mirroring
 * `POST /projects/:slug/pages`); the asset-scoped chain/link/preview routes live under /assets/:id
 * (mirroring PagesController at /pages). All routes are member-gated in AssetsService.
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':slug/assets')
  list(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Query() query: { type?: AssetType; pageId?: string; q?: string; sort?: AssetSort; page?: string },
  ): Promise<AssetListResponse> {
    return this.assets.list(req.accountId, slug, {
      type: query.type,
      pageId: query.pageId,
      q: query.q,
      sort: query.sort,
      page: query.page ? Number(query.page) : undefined,
    });
  }

  @Post(':slug/assets/from-url')
  fromUrl(@Req() req: AuthRequest, @Param('slug') slug: string, @Body() dto: CreateAssetFromUrlDto): Promise<AssetItem> {
    return this.assets.createFromUrl(req.accountId, slug, dto);
  }

  @Post(':slug/assets/:id/versions')
  addVersion(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: AddAssetVersionDto,
  ): Promise<AssetItem> {
    return this.assets.addVersion(req.accountId, slug, id, dto);
  }

  @Post(':slug/assets')
  create(@Req() req: AuthRequest, @Param('slug') slug: string, @Body() dto: CreateAssetDto): Promise<AssetItem> {
    return this.assets.createAsset(req.accountId, slug, dto);
  }
}

/** CS-3 asset-scoped routes (chain / preview / link) rooted at /assets. */
@Controller('assets')
@UseGuards(SessionGuard)
export class AssetRootController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id/versions')
  versions(@Req() req: AuthRequest, @Param('id') id: string): Promise<AssetVersionItem[]> {
    return this.assets.getVersions(req.accountId, id);
  }

  @Get(':id/preview')
  preview(@Req() req: AuthRequest, @Param('id') id: string): Promise<AssetPreviewResponse> {
    return this.assets.getPreview(req.accountId, id);
  }

  @Post(':id/active-version')
  setActiveVersion(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SetActiveVersionDto): Promise<AssetItem> {
    return this.assets.setActiveVersion(req.accountId, id, dto.version);
  }

  @Post(':id/link')
  link(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: LinkAssetDto): Promise<AssetItem> {
    return this.assets.linkToPage(req.accountId, id, dto);
  }

  @Delete(':id/link')
  unlink(@Req() req: AuthRequest, @Param('id') id: string, @Query('pageId') pageId: string): Promise<AssetItem> {
    return this.assets.unlinkFromPage(req.accountId, id, pageId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.assets.deleteAsset(req.accountId, id);
  }
}
