'use client';

// F-14: "Mes données" — data export block.
// Shows export states: idle | pending | ready | expired | failed
import { useEffect, useState } from 'react';
import { getDataExport, requestDataExport } from '../lib/api';
import type { DataExportDto } from '@encre-et-plume/shared';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function MesDonnees() {
  const [data, setData] = useState<DataExportDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const result = await getDataExport();
      setData(result);
    } catch {
      setData({ status: 'failed', requestedAt: null, readyAt: null, expiresAt: null, downloadUrl: null, expiresIn: null });
    }
  };

  // Initial load
  useEffect(() => {
    void refresh().finally(() => setLoading(false));
    // ponytail: no cleanup needed — refresh is idempotent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 4s while pending
  useEffect(() => {
    if (data?.status !== 'pending') return;
    const id = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(id);
    // ponytail: refresh is stable; only re-subscribe when status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status]);

  const handleRequest = async () => {
    // Optimistic: show generating immediately
    setData({ status: 'pending', requestedAt: new Date().toISOString(), readyAt: null, expiresAt: null, downloadUrl: null, expiresIn: null });
    try {
      const result = await requestDataExport();
      setData(result);
    } catch {
      setData({ status: 'failed', requestedAt: null, readyAt: null, expiresAt: null, downloadUrl: null, expiresIn: null });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--ink2)', fontSize: 14 }}>
        Chargement…
      </div>
    );
  }

  const status = data?.status ?? 'idle';

  return (
    <div>
      {/* Title row */}
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          margin: '0 0 10px',
          color: 'var(--ink)',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        Exporter mes données
      </h3>
      <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        Téléchargez une archive de toutes vos données conformément à l&apos;article 20 du RGPD (portabilité).
      </p>

      {/* State: idle / expired / failed → request button */}
      {(status === 'idle' || status === 'expired' || status === 'failed') && (
        <div>
          {status === 'expired' && (
            <p role="status" style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 10px' }}>
              Le lien a expiré. Vous pouvez demander un nouvel export.
            </p>
          )}
          {status === 'failed' && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 10px' }}>
              Une erreur est survenue lors de la génération de l&apos;export. Veuillez réessayer.
            </p>
          )}
          <button
            type="button"
            className="ep-btn-secondary"
            onClick={() => void handleRequest()}
            style={{ fontSize: 14, padding: '10px 18px' }}
          >
            Télécharger mes données
          </button>
        </div>
      )}

      {/* State: pending → generating message */}
      {status === 'pending' && (
        <p
          role="status"
          style={{
            fontSize: 14,
            color: 'var(--ink)',
            background: 'var(--paper)',
            border: '2px solid var(--border)',
            borderRadius: 6,
            padding: '12px 14px',
            margin: 0,
          }}
        >
          Export en cours de préparation — vous serez notifié·e.
        </p>
      )}

      {/* State: ready → download link */}
      {status === 'ready' && data?.downloadUrl && (
        <div>
          <a
            href={data.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Télécharger l'archive de mes données au format .zip — lien valable quelques minutes"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: 'var(--card)',
              border: '3px solid var(--ink)',
              borderRadius: 6,
              boxShadow: '3px 3px 0 var(--shadow)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              transition: 'transform 0.08s, box-shadow 0.08s',
            }}
          >
            <span aria-hidden="true">↓</span>
            Télécharger l&apos;archive (.zip)
          </a>
          {data.expiresAt && (
            <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '8px 0 0' }}>
              Archive disponible jusqu&apos;au {formatDate(data.expiresAt)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
