import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { NotificationPreferencesController } from './preferences.controller';
import { UnsubscribeController } from './preferences.controller';
import { NotificationPreferencesService } from './preferences.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [NotificationPreferencesController, UnsubscribeController],
  providers: [NotificationPreferencesService, PrismaService, RedisService, SessionGuard],
  exports: [NotificationPreferencesService],
})
export class PreferencesModule {}
