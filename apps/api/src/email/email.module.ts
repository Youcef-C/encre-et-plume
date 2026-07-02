import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { QueueModule } from '../queue/queue.module';
import { PreferencesModule } from '../preferences/preferences.module';

/**
 * F-16: Email module — provides EmailService (validate + preference-check + enqueue).
 * Imports QueueModule (EmailService enqueues) and PreferencesModule (F-15 opt-out check).
 * QueueModule does NOT import EmailModule → no cycle.
 * PreferencesModule depends only on PrismaService → no cycle.
 */
@Module({
  imports: [QueueModule, PreferencesModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
