import type { Metadata } from 'next';
import { Anton, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '../lib/site';
import { SessionProvider, RoleSimulationProvider, UnreadProvider, MessagingProvider, ThemeProvider, CookieConsentProvider } from './providers';
import Header from '../components/Header';
import MessagingWidget from '../components/messaging/MessagingWidget';
import SalonDock from '../components/salon/SalonDock';
import RoleBanner from '../components/RoleBanner';
import LegalFooter from '../components/LegalFooter';
import CookieBanner from '../components/CookieBanner';
import Pageview from '../components/Pageview';
import ToastHost from '../components/ToastHost';
import CguReconsentModal from '../components/CguReconsentModal';

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const zenKaku = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

// F-24 FE-1: `metadataBase` is the prerequisite for every canonical, Open Graph and Twitter URL —
// without it Next resolves them relative and the tags are silently useless. Set NEXT_PUBLIC_SITE_URL
// to the deployed origin (see lib/site.ts for the localhost fallback).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Encre & Plume',
  description: 'Plateforme française de collaboration manga',
  openGraph: { siteName: 'Encre & Plume', locale: 'fr_FR', type: 'website' },
};

// ponytail: theme picker disabled — light forced (was: SSR ep_theme cookie read; see git history)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="light" className={`${anton.variable} ${zenKaku.variable}`}>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <CookieConsentProvider>
              <UnreadProvider>
                <MessagingProvider>
                  <RoleSimulationProvider>
                    <Header />
                    <RoleBanner />
                    <main>{children}</main>
                    <LegalFooter />
                    <CookieBanner />
                    {/* F-23: cookieless audience beacon — renders nothing, stores nothing. */}
                    <Pageview />
                    <ToastHost />
                    <CguReconsentModal />
                    <MessagingWidget />
                    <SalonDock />
                  </RoleSimulationProvider>
                </MessagingProvider>
              </UnreadProvider>
            </CookieConsentProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
