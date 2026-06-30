import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, SessionGuard, PrismaService, RedisService],
})
export class ProfilesModule {}
