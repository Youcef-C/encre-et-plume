import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [AuthModule, AccountsModule, ProfilesModule],
})
export class AppModule {}
