import type { Metadata } from 'next';
import { Anton, Zen_Kaku_Gothic_New } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ThemePreference } from '@encre-et-plume/shared';
import { THEME_PREFERENCES } from '@encre-et-plume/shared';
import './globals.css';
import { SessionProvider, RoleSimulationProvider, UnreadProvider, ThemeProvider } from './providers';
import Header from '../components/Header';
import RoleBanner from '../components/RoleBanner';
import VerificationBanner from '../components/VerificationBanner';

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

// Async server component: read the ep_theme cookie to paint the correct theme
// on first SSR without any inline blocking script. The CSS [data-theme] rules do the rest.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get('ep_theme')?.value as ThemePreference | undefined;
  const theme: ThemePreference = raw && THEME_PREFERENCES.includes(raw) ? raw : 'system';

  return (
    <html lang="fr" data-theme={theme} className={`${anton.variable} ${zenKaku.variable}`}>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <UnreadProvider>
              <RoleSimulationProvider>
                <Header />
                <RoleBanner />
                <VerificationBanner />
                <main>{children}</main>
              </RoleSimulationProvider>
            </UnreadProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
