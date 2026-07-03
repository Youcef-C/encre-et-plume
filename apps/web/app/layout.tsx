import type { Metadata } from 'next';
import { Anton, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { SessionProvider, RoleSimulationProvider, UnreadProvider, ThemeProvider, CookieConsentProvider } from './providers';
import Header from '../components/Header';
import RoleBanner from '../components/RoleBanner';
import LegalFooter from '../components/LegalFooter';
import CookieBanner from '../components/CookieBanner';
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

export const metadata: Metadata = {
  title: 'Encre & Plume',
  description: 'Plateforme française de collaboration manga',
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
                <RoleSimulationProvider>
                  <Header />
                  <RoleBanner />
                  <main>{children}</main>
                  <LegalFooter />
                  <CookieBanner />
                  <CguReconsentModal />
                </RoleSimulationProvider>
              </UnreadProvider>
            </CookieConsentProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
