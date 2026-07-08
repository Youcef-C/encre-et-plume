import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { MyApplicationsController } from './my-applications.controller';
import { MyApplicationsService } from './my-applications.service';
import { ReceivedApplicationsController } from './received-applications.controller';
import { ReceivedApplicationsService } from './received-applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsModule } from '../connections/connections.module';

/** MC-1 "Appels à projets" preview: authenticated GET /calls. MC-4 + MC-5 extend this module. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule, // F-5 seam: notify the call owner on a new MC-5 application
    ConnectionsModule, // MC-8 seam: an accepted application creates the mutual connection
  ],
  controllers: [CallsController, MyApplicationsController, ReceivedApplicationsController],
  providers: [
    CallsService,
    MyApplicationsService,
    ReceivedApplicationsService,
    PrismaService,
    RedisService,
    SessionGuard,
  ],
})
export class CallsModule {}
