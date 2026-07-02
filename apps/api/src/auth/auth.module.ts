import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { SessionGuard } from './guards/session.guard';
import { SlugService } from '../slug/slug.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    JwtModule.register({
      // ponytail: reads secret from env; add ConfigModule when multi-env config grows
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
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
  exports: [EmailVerifiedGuard], // future modules use @UseGuards(SessionGuard, EmailVerifiedGuard)
})
export class AuthModule {}
