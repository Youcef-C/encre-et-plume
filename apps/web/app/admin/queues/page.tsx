'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { QueueHealthResponse } from '@encre-et-plume/shared';
import { useSession } from '../../../lib/session';
import { getQueueHealth } from '../../../lib/api';

type State =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error' }
  | { status: 'loaded'; data: QueueHealthResponse };

export default function QueuesPage() {
  const { account, loading: sessionLoading } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });

  const isAdmin = account?.role === 'admin';

  useEffect(() => {
    if (sessionLoading) return;
    if (!account || !isAdmin) {
      setState({ status: 'unauthorized' });
      return;
    }
    setState({ status: 'loading' });
    getQueueHealth()
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err: { statusCode?: number }) => {
        if (err?.statusCode === 401 || err?.statusCode === 403) {
          setState({ status: 'unauthorized' });
        } else {
          setState({ status: 'error' });
        }
      });
  }, [account, isAdmin, sessionLoading]);

  if (sessionLoading || state.status === 'loading') {
    return (
      <section style={sectionStyle}>
        <p style={{ color: 'var(--ink2)', fontWeight: 500 }}>Chargement…</p>
      </section>
    );
  }

  if (state.status === 'unauthorized') {
    return (
      <section style={sectionStyle}>
        <p style={{ color: 'var(--accent)', fontWeight: 700 }}>
          Accès réservé à l&apos;administration.
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section style={sectionStyle}>
        <p style={{ color: 'var(--accent)', fontWeight: 700 }}>
          Impossible de charger les files d&apos;attente.
        </p>
      </section>
    );
  }

  const { data } = state;

  return (
    <section style={sectionStyle}>
      {/* eyebrow */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Administration
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 5vw, 48px)',
          textTransform: 'uppercase',
          lineHeight: 1,
          margin: '0 0 8px',
        }}
      >
        Files d&apos;attente · santé
      </h1>

      <p style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 32 }}>
        Généré le{' '}
        {new Date(data.generatedAt).toLocaleString('fr-FR', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </p>

      {/* Table — horizontal scroll on narrow viewports, no page overflow */}
      <div
        style={{
          overflowX: 'auto',
          border: '3px solid var(--ink)',
          boxShadow: '5px 5px 0 var(--shadow)',
          background: 'var(--card)',
        }}
      >
        <table
          aria-label="Files d'attente"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid var(--ink)', background: 'var(--tone)' }}>
              <th scope="col" style={thStyle}>
                File
              </th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                En attente
              </th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                Actif
              </th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                Terminé
              </th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                Échoué
              </th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                Différé
              </th>
            </tr>
          </thead>
          <tbody>
            {data.queues.map((q, i) => (
              <tr
                key={q.name}
                style={{
                  borderBottom:
                    i < data.queues.length - 1 ? '1px solid var(--tone)' : 'none',
                }}
              >
                <td style={tdStyle}>{q.name}</td>
                <td style={numTdStyle}>{q.waiting}</td>
                <td style={numTdStyle}>{q.active}</td>
                <td style={numTdStyle}>{q.completed}</td>
                <td
                  style={{
                    ...numTdStyle,
                    color: q.failed > 0 ? 'var(--accent)' : undefined,
                    fontWeight: q.failed > 0 ? 700 : undefined,
                  }}
                >
                  {q.failed}
                </td>
                <td style={numTdStyle}>{q.delayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dead-letter — highlighted separately, not color-only (label + value) */}
      <div
        role="status"
        aria-label={`Lettres mortes (dead-letter) : ${data.deadLetter}`}
        style={{
          marginTop: 24,
          border: '3px solid var(--ink)',
          boxShadow: '5px 5px 0 var(--shadow)',
          background: data.deadLetter > 0 ? 'var(--accent-soft)' : 'var(--card)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            lineHeight: 1,
          }}
        >
          {data.deadLetter}
        </span>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Lettres mortes (dead-letter)
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
            {data.deadLetter === 0
              ? 'Aucune — toutes les files sont saines.'
              : 'Echecs permanents — intervention requise.'}
          </div>
        </div>
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '60px 28px',
  maxWidth: 900,
  margin: '0 auto',
};

const thStyle: CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
};

const numTdStyle: CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};
