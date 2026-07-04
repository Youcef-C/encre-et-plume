import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PreferencesModule } from '../preferences/preferences.module';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    PreferencesModule, // F-15: in-app opt-out check in create()
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, SessionGuard, PrismaService, RedisService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
