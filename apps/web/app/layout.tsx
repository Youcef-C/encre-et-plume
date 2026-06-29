import type { Metadata } from 'next';
import { Anton, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
import { SessionProvider } from './providers';
import Header from '../components/Header';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${anton.variable} ${zenKaku.variable}`}>
      <body>
        <SessionProvider>
          <Header />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
