import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { MessagingModule } from '../messaging/messaging.module';

/**
 * MC-11 "Le Comptoir": REST for the public salon dock. Reuses the MC-9 messaging backend — imports
 * MessagingModule for the shared MessagingGateway (Redis-adapter socket + salon presence). No new
 * message storage, no gateway of its own.
 */
@Module({
  imports: [
    JwtModule.register({ secret: getJwtSecret(), signOptions: { expiresIn: '7d' } }),
    MessagingModule, // exports MessagingGateway (salon fan-out + presence)
  ],
  controllers: [SalonController],
  providers: [SalonService, PrismaService, RedisService, SessionGuard],
})
export class SalonModule {}
