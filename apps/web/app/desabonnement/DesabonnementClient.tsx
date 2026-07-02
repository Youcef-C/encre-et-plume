'use client';

// F-15: /desabonnement?token=… — public unsubscribe landing page.
// POSTs the token once on mount; renders success or error state.

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { unsubscribe } from '../../lib/api';

type PageState = 'loading' | 'success' | 'error';

export default function DesabonnementClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<PageState>('loading');
  const [group, setGroup] = useState<string | null>(null);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (!token) {
      setState('error');
      return;
    }

    unsubscribe(token)
      .then((data) => {
        setGroup(data.group);
        setState('success');
      })
      .catch(() => setState('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 69px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        background: 'var(--paper)',
      }}
    >
      <div
        className="ep-card"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '40px 36px',
          textAlign: 'center',
        }}
      >
        {state === 'loading' && (
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Traitement en cours…</p>
        )}

        {state === 'success' && (
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                textTransform: 'uppercase',
                lineHeight: 1,
                marginBottom: 16,
                color: 'var(--ink)',
              }}
            >
              Désinscription confirmée
            </h1>
            {group && (
              <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 8 }}>
                Catégorie : <strong>{group}</strong>
              </p>
            )}
            <p style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 28, fontWeight: 600 }}>
              Vous ne recevrez plus ces e-mails.
            </p>
            <Link
              href="/parametres"
              style={{
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--accent)',
                textDecoration: 'underline',
              }}
            >
              Gérer mes préférences
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div role="alert" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                textTransform: 'uppercase',
                lineHeight: 1,
                marginBottom: 16,
                color: 'var(--accent)',
              }}
            >
              Lien invalide
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 24 }}>
              Ce lien de désinscription est invalide ou a expiré. Veuillez utiliser le lien présent dans votre dernier e-mail.
            </p>
            <Link
              href="/parametres"
              style={{
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--ink2)',
                textDecoration: 'underline',
              }}
            >
              Gérer mes préférences
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
