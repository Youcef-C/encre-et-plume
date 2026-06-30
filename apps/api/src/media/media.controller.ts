import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MediaService } from './media.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import type { RequestUploadResponse, MediaResponse, SignedUrlResponse } from '@encre-et-plume/shared';

/**
 * REST endpoints for media lifecycle:
 *   POST   /media/uploads       — presign + create pending Media record
 *   POST   /media/:id/finalize  — verify object, strip EXIF, enqueue processing
 *   GET    /media/:id           — owner-gated polling (frontend polls until status=ready)
 *   GET    /media/:id/url       — signed URL (owner-gated for private; CDN URL for public)
 *
 * The client PUTs bytes directly to storage (presignedUrl) — never through this API.
 */
@Controller('media')
@UseGuards(SessionGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads')
  requestUpload(
    @Req() req: AuthRequest,
    @Body() dto: RequestUploadDto,
  ): Promise<RequestUploadResponse> {
    return this.mediaService.requestUpload(req.accountId, dto);
  }

  @Post(':id/finalize')
  finalize(@Req() req: AuthRequest, @Param('id') id: string): Promise<MediaResponse> {
    return this.mediaService.finalize(req.accountId, id);
  }

  @Get(':id')
  getOne(@Req() req: AuthRequest, @Param('id') id: string): Promise<MediaResponse> {
    return this.mediaService.getForOwner(req.accountId, id);
  }

  @Get(':id/url')
  getSignedUrl(@Req() req: AuthRequest, @Param('id') id: string): Promise<SignedUrlResponse> {
    return this.mediaService.signedUrl(req.accountId, id);
  }
}
