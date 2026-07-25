'use client';

// F-18: E-mail change confirmation landing page.
// Reads ?token=, calls POST /auth/email-change/confirm, shows success or error.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmEmailChange } from '../../../lib/api';
import type { ApiError } from '@encre-et-plume/shared';
import { EMAIL_CHANGE_TOKEN_INVALID, EMAIL_CHANGE_TOKEN_EXPIRED } from '@encre-et-plume/shared';

type State = 'loading' | 'success' | 'invalid' | 'expired' | 'error';

export default function ConfirmerEmailClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    confirmEmailChange(token)
      .then(() => setState('success'))
      .catch((err: ApiError) => {
        if (err.error === EMAIL_CHANGE_TOKEN_EXPIRED) setState('expired');
        else if (err.error === EMAIL_CHANGE_TOKEN_INVALID) setState('invalid');
        else setState('error');
      });
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
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Confirmation en cours…</p>
        )}

        {state === 'success' && (
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 16,
                color: 'var(--ink)',
              }}
            >
              Adresse e-mail mise à jour !
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 24 }}>
              Votre adresse e-mail a été mise à jour avec succès.
            </p>
            <Link
              href="/parametres"
              className="ep-btn-primary"
              style={{ display: 'inline-block', textDecoration: 'none', fontSize: 14 }}
            >
              Retour aux paramètres
            </Link>
          </div>
        )}

        {(state === 'invalid' || state === 'expired' || state === 'error') && (
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 16,
                color: 'var(--accent)',
              }}
            >
              Lien invalide ou expiré.
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 24 }}>
              {state === 'expired'
                ? 'Ce lien de confirmation a expiré (validité 24 h). Refaites la demande depuis vos paramètres.'
                : 'Ce lien est invalide ou a déjà été utilisé.'}
            </p>
            <Link
              href="/parametres#securite"
              className="ep-btn-secondary"
              style={{ display: 'inline-block', textDecoration: 'none', fontSize: 14 }}
            >
              Retour aux paramètres
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
