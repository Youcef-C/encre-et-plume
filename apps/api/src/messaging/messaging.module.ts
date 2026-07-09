import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ConversationsController } from './conversations.controller';
import { MessagesService } from './messages.service';
import { MessagingGateway } from './messaging.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { QueueService } from '../queue/queue.service';
import { PresenceService } from '../connections/presence.service';
import { SecurityModule } from '../security/security.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { BlocksModule } from '../blocks/blocks.module';
import { ConnectionsModule } from '../connections/connections.module';

/**
 * MC-9 "Messaging (floating widget)": REST history/send/create/read + the socket.io gateway (Redis
 * adapter wired in main.ts). Imports SecurityModule for SessionStore (gateway presence touch reuses the
 * F-18 session index). QueueService is global-ish via QueueModule (imported at the app level); provided
 * here to inject into MessagesService for offline notification fan-out.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    SecurityModule, // exports SessionStore for the gateway presence touch (MC-8 presence)
    NotificationsModule, // BE-RT1: wire the gateway as NotificationsService's RealtimeNotifier (one-way import → no cycle)
    BlocksModule, // MC-10: blocked-pair check on DM send / getOrCreateDm
    ConnectionsModule, // MC-9 delta / F-19: stateBetween('connected') for DM policy routing
  ],
  controllers: [ConversationsController],
  providers: [
    MessagesService,
    MessagingGateway,
    PrismaService,
    RedisService,
    SessionGuard,
    QueueService,
    PresenceService,
  ],
  exports: [MessagesService, MessagingGateway],
})
export class MessagingModule implements OnModuleInit {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly gateway: MessagingGateway,
  ) {}

  // BE-RT1: the gateway becomes NotificationsService's realtime notifier. One-directional import
  // (MessagingModule → NotificationsModule), so no circular dependency.
  onModuleInit(): void {
    this.notifications.setRealtimeNotifier(this.gateway);
  }
}
