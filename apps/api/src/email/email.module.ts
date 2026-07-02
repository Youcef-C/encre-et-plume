import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { QueueModule } from '../queue/queue.module';

/**
 * F-16: Email module — provides EmailService (validate + enqueue seam).
 * Imports QueueModule to resolve QueueService for EmailService.
 * QueueModule does NOT import EmailModule (EMAIL_TRANSPORT is provided by QueueModule directly),
 * so there is no circular module dependency.
 */
@Module({
  imports: [QueueModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
