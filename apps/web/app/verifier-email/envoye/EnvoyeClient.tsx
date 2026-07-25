'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ApiError } from '@encre-et-plume/shared';
import { resendVerificationEmail } from '../../../lib/api';

type ResendStatus = 'idle' | 'pending' | 'sent' | 'rate-limited';

const OUTER: React.CSSProperties = {
  minHeight: 'calc(100dvh - 69px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 16px',
};

const CARD: React.CSSProperties = {
  width: '100%',
  maxWidth: 440,
  padding: '40px 36px',
  textAlign: 'center',
};

export default function EnvoyeClient() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const reason = params.get('reason');

  const [resend, setResend] = useState<ResendStatus>('idle');

  async function handleResend() {
    if (!email) return;
    setResend('pending');
    try {
      await resendVerificationEmail(email);
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

  const backLink = (
    <p style={{ fontSize: 14, marginTop: 20 }}>
      <Link
        href="/connexion"
        style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
      >
        Retour à la connexion
      </Link>
    </p>
  );

  return (
    <div style={OUTER}>
      <div className="ep-card" style={CARD}>
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
          Vérifiez votre e-mail
        </h1>

        <p style={{ color: 'var(--ink)', fontSize: 15, marginBottom: reason === 'login' ? 12 : 24 }}>
          Un lien de confirmation vous a été envoyé à{' '}
          <strong>{email}</strong>.
        </p>

        {reason === 'login' && (
          <p
            style={{
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            Confirmez votre e-mail pour continuer.
          </p>
        )}

        <div role="status" aria-live="polite" style={{ marginBottom: 20 }}>
          {resend === 'sent' && (
            <p style={{ fontWeight: 700, color: 'var(--ink)' }}>E-mail envoyé.</p>
          )}
          {resend === 'rate-limited' && (
            <p style={{ fontWeight: 700, color: 'var(--ink)' }}>
              Veuillez patienter avant de renvoyer l&apos;e-mail.
            </p>
          )}
          {(resend === 'idle' || resend === 'pending') && (
            <button
              onClick={handleResend}
              disabled={resend === 'pending' || !email}
              className="ep-btn-primary"
              style={{ minHeight: 44 }}
            >
              Renvoyer l&apos;e-mail
            </button>
          )}
        </div>

        {backLink}
      </div>
    </div>
  );
}
