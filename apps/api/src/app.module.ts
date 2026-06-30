import { Module } from '@nestjs/common';
import { ObservabilityModule } from './observability/observability.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { QueueModule } from './queue/queue.module';

@Module({
  // ObservabilityModule first: makes MetricsService/AppLoggerService globally available
  // before QueueModule's JobMetrics (which injects MetricsService) initialises.
  imports: [ObservabilityModule, AuthModule, AccountsModule, ProfilesModule, NotificationsModule, SearchModule, QueueModule],
})
export class AppModule {}
