import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import { MediaService } from '../../media/media.service';
import type { ImageProcessingJob } from '@encre-et-plume/shared';

/**
 * Processor for the `image-processing` queue (reserved in F-8).
 * Branches on job.name:
 *   'process-variants' — MediaService.processVariants(mediaId): sharp → variants, status=ready.
 *   'orphan-cleanup'   — MediaService.cleanupOrphans(): delete pending media > 1h old.
 *
 * Errors rethrow so WorkerRunner's 'failed' handler dead-letters on final attempt.
 */
@Injectable()
export class ImageProcessingProcessor implements JobProcessor<ImageProcessingJob | Record<string, never>> {
  readonly queue = 'image-processing' as const;
  readonly concurrency = 2; // image processing is CPU/memory intensive

  constructor(private readonly mediaService: MediaService) {}

  async process(data: ImageProcessingJob | Record<string, never>, job: Job): Promise<void> {
    if (job.name === 'orphan-cleanup') {
      await this.mediaService.cleanupOrphans();
      return;
    }

    // CS-3: docx → sanitized HTML derivative (off the request path).
    if (job.name === 'docx-preview') {
      await this.mediaService.processDocxPreview((data as ImageProcessingJob).mediaId);
      return;
    }

    // Default: process-variants
    await this.mediaService.processVariants((data as ImageProcessingJob).mediaId);
  }
}
