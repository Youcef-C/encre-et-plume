import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3StorageService } from './s3-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { QueueService } from '../queue/queue.service';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, S3StorageService, PrismaService, RedisService, SessionGuard],
  exports: [MediaService],
})
export class MediaModule implements OnModuleInit {
  constructor(private readonly queue: QueueService) {}

  /**
   * Register the hourly orphan-cleanup repeatable job.
   * BullMQ de-dups repeatable jobs by pattern, so this is idempotent across
   * API and worker processes.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.schedule('image-processing', 'orphan-cleanup', {}, { pattern: '0 * * * *' });
    } catch {
      // Non-fatal: cleanup is best-effort; Redis may be unavailable at startup
    }
  }
}
