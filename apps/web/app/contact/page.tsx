// F-21: "Aide & contact" — public support/contact page (reachable signed out).
import type { Metadata } from 'next';
import ContactClient from '../../components/contact/ContactClient';

export const metadata: Metadata = {
  title: 'Aide & contact — Encre & Plume',
  description:
    'Contactez l’équipe Encre & Plume : question, problème de compte ou signalement de bug.',
};

export default function ContactPage() {
  return (
    <main style={{ padding: '48px 24px 72px', background: 'var(--paper)', minHeight: '60vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto 28px' }}>
        <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', margin: '0 0 8px' }}>Aide &amp; contact</h1>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
          Une question, un souci avec votre compte ou un bug à signaler ? Écrivez-nous.
        </p>
      </div>
      <ContactClient />
    </main>
  );
}
