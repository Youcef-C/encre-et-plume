'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '../../lib/session';
import { confirmEmail, resendVerificationEmail } from '../../lib/api';
import type { ApiError } from '@encre-et-plume/shared';

type PageState = 'loading' | 'success' | 'error';
type ResendStatus = 'idle' | 'pending' | 'sent' | 'rate-limited';

export default function VerifierEmailClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const { account, refresh } = useSession();

  const [state, setState] = useState<PageState>('loading');
  const [resend, setResend] = useState<ResendStatus>('idle');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    confirmEmail(token)
      .then(async () => {
        await refresh();
        setState('success');
      })
      .catch(() => setState('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResend() {
    setResend('pending');
    try {
      await resendVerificationEmail();
      setResend('sent');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.error === 'RATE_LIMITED' || apiErr?.statusCode === 429) {
        setResend('rate-limited');
      } else {
        setResend('idle');
      }
    }
  }

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
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Vérification en cours…</p>
        )}

        {state === 'success' && (
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 16,
                color: 'var(--ink)',
              }}
            >
              Adresse e-mail vérifiée !
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 14 }}>
              Votre adresse e-mail a bien été confirmée.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 16,
                color: 'var(--accent)',
              }}
            >
              Lien invalide ou expiré.
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 24 }}>
              Ce lien de vérification n&apos;est plus valide ou a déjà été utilisé.
            </p>

            {account && resend === 'idle' && (
              <button onClick={handleResend} className="ep-btn" style={{ minHeight: 44 }}>
                Renvoyer l&apos;e-mail
              </button>
            )}
            {account && resend === 'pending' && (
              <button disabled className="ep-btn" style={{ minHeight: 44, cursor: 'not-allowed' }}>
                Renvoyer l&apos;e-mail
              </button>
            )}
            {resend === 'sent' && (
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>E-mail envoyé.</p>
            )}
            {resend === 'rate-limited' && (
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>
                Veuillez patienter avant de renvoyer l&apos;e-mail.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
