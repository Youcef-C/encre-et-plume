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
import { ListModule } from './list/list.module';
import { ReactionsModule } from './reactions/reactions.module';
import { SupportModule } from './support/support.module';
import { PartnersModule } from './partners/partners.module';
import { CallsModule } from './calls/calls.module';
import { MatchesModule } from './matches/matches.module';
import { ProjectsModule } from './projects/projects.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ConnectionsModule } from './connections/connections.module';
import { MessagingModule } from './messaging/messaging.module';
import { SalonModule } from './salon/salon.module';
import { BlocksModule } from './blocks/blocks.module';

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
  // ListModule (DR-8): GET /me/list, GET /me/likes — "Ma liste & coups de cœur" (removeFromList
  //   moved to ReactionsModule's DELETE /reactions/save, B5 — single unsave implementation).
  // ReactionsModule (DR-9): POST/DELETE /reactions/{like,save} + GET /reactions/state.
  // SupportModule (F-21): public POST /support/tickets — help/contact/bug channel.
  // PartnersModule (MC-1): authenticated GET /partners — "Trouver un·e partenaire" creator directory.
  // CallsModule (MC-1): authenticated GET /calls — "Appels à projets" preview (MC-4 extends).
  // MatchesModule (MC-2): authenticated GET /matches/suggestions — affinity-scored partner suggestions.
  // ProjectsModule (CS-1 seam): authenticated GET /projects/mine — MC-3 invite picker source.
  // InvitationsModule (MC-3): authenticated POST/GET/PATCH /invitations — "Proposer une collab".
  // ConnectionsModule (MC-8): authenticated /contacts, /connections/*, /people/search, /presence.
  // MessagingModule (MC-9): authenticated /conversations* REST + the socket.io WS gateway (Redis adapter).
  // SalonModule (MC-11): authenticated /salon* — public community room "Le Comptoir" reusing MC-9's backend.
  // BlocksModule (MC-10): self-service /me/blocks; exports BlocksService for enforcement consumers.
  imports: [ObservabilityModule, PreferencesModule, EmailModule, LegalModule, AuthModule, AccountsModule, ProfilesModule, NotificationsModule, SearchModule, QueueModule, PrivacyModule, OnboardingModule, SecurityModule, HomeModule, RankingModule, CatalogModule, WorksModule, ReaderModule, ReadingHistoryModule, GalleryModule, ListModule, ReactionsModule, SupportModule, PartnersModule, CallsModule, MatchesModule, ProjectsModule, InvitationsModule, ConnectionsModule, MessagingModule, SalonModule, BlocksModule],
})
export class AppModule {}
