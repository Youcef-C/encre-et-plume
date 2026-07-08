/**
 * F-18: SecurityModule — wires all account-security services + controllers.
 * Imported by AppModule after AuthModule.
 *
 * Circular-dep break: AuthService.login() needs to check 2FA, but AuthModule must not
 * import SecurityModule (circular). Solution: SecurityModule gets AuthService from
 * AuthModule and calls setter methods on it via OnModuleInit.
 *
 * The 3 public /auth/2fa+email-change endpoints live in SecurityAuthController (this
 * module) rather than AuthController — avoids needing to export AuthController (which
 * NestJS forbids: controllers are not exportable providers).
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { EmailModule } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SecurityController } from './security.controller';
import { SecurityAuthController } from './security-auth.controller';
import { EmailChangeService } from './email-change.service';
import { PasswordChangeService } from './password-change.service';
import { TwoFactorService } from './two-factor.service';
import { SessionStore } from './session-store.service';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [SecurityController, SecurityAuthController],
  providers: [
    PrismaService,
    RedisService,
    EmailChangeService,
    PasswordChangeService,
    TwoFactorService,
    SessionStore,
  ],
  exports: [SessionStore], // MC-9: the messaging gateway reuses SessionStore.touch for presence
})
export class SecurityModule implements OnModuleInit {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionGuard: SessionGuard,
    private readonly twoFactor: TwoFactorService,
    private readonly sessionStore: SessionStore,
  ) {}

  onModuleInit(): void {
    // Wire TwoFactorService into AuthService so login() can issue 2FA challenges.
    this.authService.setTwoFactorService(this.twoFactor);
    // Wire SessionStore into SessionGuard for best-effort session index touch.
    this.sessionGuard.setSessionStore(this.sessionStore);
  }
}
