import { Module } from '@nestjs/common';
import { ObservabilityModule } from './observability/observability.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { ProfilesModule } from './profiles/profiles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { QueueModule } from './queue/queue.module';
import { EmailModule } from './email/email.module';
import { LegalModule } from './legal/legal.module';
import { PrivacyModule } from './privacy/privacy.module';
import { PreferencesModule } from './preferences/preferences.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SecurityModule } from './security/security.module';
import { HomeModule } from './home/home.module';
import { RankingModule } from './ranking/ranking.module';
import { CatalogModule } from './catalog/catalog.module';
import { WorksModule } from './works/works.module';
import { ReaderModule } from './reader/reader.module';
import { ReadingHistoryModule } from './reading-history/reading-history.module';
import { GalleryModule } from './gallery/gallery.module';

@Module({
  // ObservabilityModule first: makes MetricsService/AppLoggerService globally available
  // before QueueModule's JobMetrics (which injects MetricsService) initialises.
  // EmailModule before AuthModule: AuthModule imports EmailModule → EmailService.
  // LegalModule before AuthModule: AuthModule imports LegalModule → LegalService.
  // QueueModule imports MediaModule (ImageProcessingProcessor); MediaModule is transitively loaded.
  // PrivacyModule (F-14): RGPD deletion + data export; imports MediaModule/NotificationsModule/EmailModule.
  // PreferencesModule before EmailModule and NotificationsModule: both import PreferencesModule.
  // OnboardingModule (F-17): POST /me/onboarding — first-run wizard.
  // HomeModule (DR-1): public GET /home/* showroom aggregation for the "Accueil" landing page.
  // RankingModule (DR-7): public GET /ranking/all-time?genre= — extends DR-1's ranking.util single source.
  // CatalogModule (DR-2): public GET /catalog* + /contests/active for the "Découvrir" catalog page.
  // WorksModule (DR-3): public GET /works/:slug* for the "Œuvre" work detail page.
  // ReaderModule (DR-4): GET /works/:slug/chapters/:n/pages + /me/favorites + /me/reading-progress.
  // ReadingHistoryModule (DR-11): GET /me/reading-history(/:workSlug) — resume "Reprendre la lecture".
  // GalleryModule (DR-5): public GET /illustrations* for the "Galerie" illustration gallery page.
  imports: [ObservabilityModule, PreferencesModule, EmailModule, LegalModule, AuthModule, AccountsModule, ProfilesModule, NotificationsModule, SearchModule, QueueModule, PrivacyModule, OnboardingModule, SecurityModule, HomeModule, RankingModule, CatalogModule, WorksModule, ReaderModule, ReadingHistoryModule, GalleryModule],
})
export class AppModule {}
