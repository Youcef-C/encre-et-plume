import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  AssetItem,
  AutosaveDocumentResponse,
  CaseCommentDto,
  DeleteCaseCommentResponse,
  EditorDocumentResponse,
  SharePageResponse,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ScenarioDocumentsService } from './scenario-documents.service';
import { AutosaveDocumentDto, CreateCaseCommentDto, SnapshotVersionDto } from './dto/editor.dto';

/**
 * CS-4 collaborative script editor routes, rooted at /pages (matches the CS-2 PagesController style).
 * Every route is member-gated in the service (page → project → member; non-member/absent → 404).
 * The file dropdown reuses the existing GET /projects/:slug/assets (no route added here).
 */
@Controller('pages')
@UseGuards(SessionGuard)
export class ScenarioDocumentsController {
  constructor(private readonly scenarios: ScenarioDocumentsService) {}

  /** Structured planche document for the editor (asset binding, contentJson, cases, comments).
   *  Optional `?asset=<id>` opens a CHOSEN scenario/texte asset (file dropdown / import) instead of the
   *  card's linked scenario — 404 (no leak) if it isn't a scenario/texte asset of the same project. */
  @Get(':id/document')
  getDocument(@Req() req: AuthRequest, @Param('id') id: string, @Query('asset') asset?: string): Promise<EditorDocumentResponse> {
    return this.scenarios.getDocument(req.accountId, id, asset);
  }

  /** Persist the autosaved draft IN PLACE (materializes a scenario asset on the first save of a blank
   *  card). Never creates an AssetVersion. `?asset` edits that asset's draft in place (no new link). */
  @Patch(':id/document')
  autosave(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: AutosaveDocumentDto, @Query('asset') asset?: string): Promise<AutosaveDocumentResponse> {
    return this.scenarios.autosave(req.accountId, id, dto, asset);
  }

  /** "Enregistrer une nouvelle version": snapshot the current draft as a new CS-3 AssetVersion. The
   *  ONLY path that bumps the version. Page-scoped because the content originates in-app (no mediaId). */
  @Post(':id/document/versions')
  snapshotVersion(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SnapshotVersionDto, @Query('asset') asset?: string): Promise<AssetItem> {
    return this.scenarios.snapshotVersion(req.accountId, id, dto, asset);
  }

  /** Add a per-case comment (right sidebar). */
  @Post(':id/cases/:caseNo/comments')
  addComment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('caseNo', ParseIntPipe) caseNo: number,
    @Body() dto: CreateCaseCommentDto,
    @Query('asset') asset?: string,
  ): Promise<CaseCommentDto> {
    return this.scenarios.addComment(req.accountId, id, caseNo, dto, asset);
  }

  /** CS-15 — author-only delete of a scenario comment (403 for anyone else; 404 if it isn't on this
   *  page's document). Broadcasts `comment:deleted` so connected peers drop it live. */
  @Delete(':id/document/comments/:commentId')
  deleteComment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Query('asset') asset?: string,
  ): Promise<DeleteCaseCommentResponse> {
    return this.scenarios.deleteComment(req.accountId, id, commentId, asset);
  }

  /** "Partager": returns the editor URL (thin — every project member can already edit). */
  @Post(':id/share')
  share(@Req() req: AuthRequest, @Param('id') id: string): Promise<SharePageResponse> {
    return this.scenarios.share(req.accountId, id);
  }
}
