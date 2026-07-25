'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '../../lib/session';
import { confirmEmail, resendVerificationEmail } from '../../lib/api';
import { POST_VERIFICATION_REDIRECT } from '@encre-et-plume/shared';
import type { ApiError } from '@encre-et-plume/shared';

type PageState = 'loading' | 'success' | 'error';
type ResendStatus = 'idle' | 'pending' | 'sent' | 'rate-limited';

export default function VerifierEmailClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const { refresh } = useSession();
  const router = useRouter();

  const [state, setState] = useState<PageState>('loading');
  const [resend, setResend] = useState<ResendStatus>('idle');
  const [resendEmail, setResendEmail] = useState('');
  // used to populate the email input from the session if available
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    confirmEmail(token)
      .then(async () => {
        await refresh();
        setState('success');
        // Announce BEFORE redirecting (US: "the redirect is announced before it happens"):
        // hold the success message ~1.5s so it is actually readable/announced, then leave.
        if (!hasRedirected.current) {
          hasRedirected.current = true;
          setTimeout(() => router.replace(POST_VERIFICATION_REDIRECT), 1500);
        }
      })
      .catch(() => setState('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResend() {
    if (!resendEmail.trim()) return;
    setResend('pending');
    try {
      await resendVerificationEmail(resendEmail.trim());
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
              Vous allez être redirigé(e)…
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

            {resend === 'sent' && (
              <p style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                E-mail envoyé.
              </p>
            )}
            {resend === 'rate-limited' && (
              <p style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>
                Veuillez patienter avant de renvoyer l&apos;e-mail.
              </p>
            )}

            {resend !== 'sent' && resend !== 'rate-limited' && (
              <div style={{ textAlign: 'left' }}>
                <label
                  htmlFor="resend-email"
                  className="ep-label"
                  style={{ display: 'block', marginBottom: 8 }}
                >
                  E-mail
                </label>
                <input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="ep-input"
                  style={{ marginBottom: 12 }}
                />
                <button
                  onClick={handleResend}
                  disabled={resend === 'pending' || !resendEmail.trim()}
                  className="ep-btn-primary"
                  style={{ minHeight: 44, width: '100%' }}
                >
                  Renvoyer l&apos;e-mail
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
