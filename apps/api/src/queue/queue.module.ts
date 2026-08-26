import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { QueueService } from './queue.service';
import { WorkerRunner } from './worker-runner';
import { JobMetrics } from './job-metrics';
import { NotificationsFanoutProcessor } from './processors/notifications-fanout.processor';
import { ImageProcessingProcessor } from './processors/image-processing.processor';
import { EmailProcessor } from './processors/email.processor';
import { DataExportProcessor } from './processors/data-export.processor';
import { AccountErasureProcessor } from './processors/account-erasure.processor';
import { CloseCallProcessor } from './processors/close-call.processor';
import { TrendingProcessor } from './processors/trending.processor';
import { QUEUE_PROCESSORS } from './job-processor';
import { QueueHealthController } from './queue-health.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EMAIL_TRANSPORT, createEmailTransport } from '../email/email-transport';
import { EmailService } from '../email/email.service';
import { PreferencesModule } from '../preferences/preferences.module';

@Global()
@Module({
  imports: [
    NotificationsModule, // exports NotificationsService → injected into NotificationsFanoutProcessor + DataExportProcessor
    MediaModule,         // exports MediaService → injected into ImageProcessingProcessor + DataExportProcessor + AccountErasureProcessor
    PreferencesModule,   // F-15: exports NotificationPreferencesService → EmailService's opt-out check (no circular dep: PreferencesModule imports nothing from here)
    JwtModule.register({
      secret: getJwtSecret(),
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
    EmailProcessor,
    DataExportProcessor,     // F-14
    AccountErasureProcessor, // F-14
    CloseCallProcessor,      // MC-4
    TrendingProcessor,       // DR-13
    // F-16: EMAIL_TRANSPORT in QueueModule (not EmailModule) — avoids circular dep:
    // EmailService (in EmailModule) injects QueueService (in QueueModule @Global).
    { provide: EMAIL_TRANSPORT, useFactory: createEmailTransport },
    // F-14: EmailService provided directly (no EmailModule import) — avoids circular dep.
    // EmailService only injects QueueService which is global in this same module.
    EmailService,
    {
      // ponytail: factory collects processors; add new processors by extending inject + factory args
      provide: QUEUE_PROCESSORS,
      useFactory: (
        fanout: NotificationsFanoutProcessor,
        imgProc: ImageProcessingProcessor,
        emailProc: EmailProcessor,
        dataExport: DataExportProcessor,
        accountErasure: AccountErasureProcessor,
        closeCall: CloseCallProcessor,
        trending: TrendingProcessor,
      ) => [fanout, imgProc, emailProc, dataExport, accountErasure, closeCall, trending],
      inject: [NotificationsFanoutProcessor, ImageProcessingProcessor, EmailProcessor, DataExportProcessor, AccountErasureProcessor, CloseCallProcessor, TrendingProcessor],
    },
    PrismaService,
    SessionGuard,
    RolesGuard,
    RedisService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
