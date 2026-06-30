import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [AuthModule, AccountsModule, ProfilesModule, NotificationsModule, SearchModule, QueueModule],
})
export class AppModule {}
