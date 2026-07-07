import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { NotificationsModule } from '../notifications/notifications.module';

/** MC-1 "Appels à projets" preview: authenticated GET /calls. MC-4 + MC-5 extend this module. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule, // F-5 seam: notify the call owner on a new MC-5 application
  ],
  controllers: [CallsController],
  providers: [CallsService, PrismaService, RedisService, SessionGuard],
})
export class CallsModule {}
