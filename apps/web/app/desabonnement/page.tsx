// F-15: /desabonnement — public unsubscribe landing (no auth required).
import { Suspense } from 'react';
import DesabonnementClient from './DesabonnementClient';

export default function DesabonnementPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: 'calc(100dvh - 69px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
          }}
        >
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Traitement en cours…</p>
        </div>
      }
    >
      <DesabonnementClient />
    </Suspense>
  );
}
