import { Module } from '@nestjs/common';
import { ObservabilityModule } from './observability/observability.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { QueueModule } from './queue/queue.module';
import { EmailModule } from './email/email.module';
import { LegalModule } from './legal/legal.module';

@Module({
  // ObservabilityModule first: makes MetricsService/AppLoggerService globally available
  // before QueueModule's JobMetrics (which injects MetricsService) initialises.
  // EmailModule before AuthModule: AuthModule imports EmailModule → EmailService.
  // LegalModule before AuthModule: AuthModule imports LegalModule → LegalService.
  // QueueModule imports MediaModule (ImageProcessingProcessor); MediaModule is transitively loaded.
  imports: [ObservabilityModule, EmailModule, LegalModule, AuthModule, AccountsModule, ProfilesModule, NotificationsModule, SearchModule, QueueModule],
})
export class AppModule {}
