import { Suspense } from 'react';
import ConfirmerEmailClient from './ConfirmerEmailClient';

export default function ConfirmerEmailPage() {
  return (
    <Suspense fallback={
      <div
        style={{
          minHeight: 'calc(100dvh - 69px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Chargement…</p>
      </div>
    }>
      <ConfirmerEmailClient />
    </Suspense>
  );
}
