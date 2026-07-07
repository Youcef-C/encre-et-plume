'use client';

// MC-1 §11 — minimal Appels à projets board: heading + the seeded calls (GET /calls, limit 6),
// reusing the CallsPreview card grid. No posting/filters yet (MC-4). Auth-gated like /trouver.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CallPreview } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import CallsPreview from '../trouver/CallsPreview';

type Status = 'loading' | 'ready' | 'error';

export default function AppelsClient() {
  const { account, loading: sessionLoading } = useSession();
  const [calls, setCalls] = useState<CallPreview[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setStatus('loading');
    api
      .getCalls(6)
      .then((res) => {
        if (cancelled) return;
        setCalls(res.items);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [account, retry]);

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Appels à projets</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour parcourir les appels à projets.
        </p>
        <Link
          href="/connexion?redirect=/appels"
          style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 28px 80px' }}>
      <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: '0 0 6px' }}>Appels à projets</h1>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 22 }}>
        Les scénaristes et dessinateur·rices qui cherchent un·e partenaire pour un projet.
      </div>

      {status === 'loading' && <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Chargement…</p>}

      {status === 'error' && (
        <div role="alert" style={{ padding: '20px 0' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Impossible de charger les appels à projets.
          </p>
          <button
            type="button"
            onClick={() => setRetry((k) => k + 1)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {status === 'ready' &&
        (calls.length === 0 ? (
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Aucun appel ouvert pour le moment.</p>
        ) : (
          <CallsPreview calls={calls} hideHeader />
        ))}
    </div>
  );
}
