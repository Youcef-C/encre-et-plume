import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from './jwt-secret';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { SessionGuard } from './guards/session.guard';
import { SlugService } from '../slug/slug.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailModule } from '../email/email.module';
import { LegalModule } from '../legal/legal.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    EmailModule,
    LegalModule,
    AnalyticsModule, // F-23: exports AnalyticsService — signup emits its `signup` event through it
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    EmailVerifiedGuard,
    SessionGuard,
    SlugService,
    PrismaService,
    RedisService,
  ],
  exports: [AuthService, EmailVerifiedGuard, SessionGuard, JwtModule], // SecurityModule imports AuthModule; controllers cannot be exported
})
export class AuthModule {}
