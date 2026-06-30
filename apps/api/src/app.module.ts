import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [AuthModule, AccountsModule, ProfilesModule, NotificationsModule],
})
export class AppModule {}
