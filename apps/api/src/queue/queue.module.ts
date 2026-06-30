import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { QueueService } from './queue.service';
import { WorkerRunner } from './worker-runner';
import { JobMetrics } from './job-metrics';
import { NotificationsFanoutProcessor } from './processors/notifications-fanout.processor';
import { ImageProcessingProcessor } from './processors/image-processing.processor';
import { QUEUE_PROCESSORS } from './job-processor';
import { QueueHealthController } from './queue-health.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Global()
@Module({
  imports: [
    NotificationsModule, // exports NotificationsService → injected into NotificationsFanoutProcessor
    MediaModule,         // exports MediaService → injected into ImageProcessingProcessor
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [QueueHealthController],
  providers: [
    QueueService,
    WorkerRunner,
    JobMetrics,
    NotificationsFanoutProcessor,
    ImageProcessingProcessor,
    {
      // ponytail: factory collects processors; add new processors by extending inject + factory args
      provide: QUEUE_PROCESSORS,
      useFactory: (fanout: NotificationsFanoutProcessor, imgProc: ImageProcessingProcessor) => [fanout, imgProc],
      inject: [NotificationsFanoutProcessor, ImageProcessingProcessor],
    },
    PrismaService,
    SessionGuard,
    RolesGuard,
    RedisService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
