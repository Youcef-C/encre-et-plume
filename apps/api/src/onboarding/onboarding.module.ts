import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, PrismaService, RedisService, SessionGuard],
})
export class OnboardingModule {}
