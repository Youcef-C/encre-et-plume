'use client';

import { useState } from 'react';
import { useSession } from '../lib/session';
import { resendVerificationEmail } from '../lib/api';
import type { ApiError } from '@encre-et-plume/shared';

type ResendStatus = 'idle' | 'pending' | 'sent' | 'rate-limited';

export default function VerificationBanner() {
  const { account } = useSession();
  const [status, setStatus] = useState<ResendStatus>('idle');

  if (!account || account.emailVerified) return null;

  async function handleResend() {
    setStatus('pending');
    try {
      await resendVerificationEmail();
      setStatus('sent');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.error === 'RATE_LIMITED' || apiErr?.statusCode === 429) {
        setStatus('rate-limited');
      } else {
        setStatus('idle');
      }
    }
  }

  return (
    <div
      role="status"
      aria-label="Vérification de l'e-mail requise"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px 16px',
        padding: '10px 20px',
        background: 'var(--accent-soft)',
        borderBottom: '3px solid var(--ink)',
        fontSize: 13,
        color: 'var(--ink)',
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>
        Vérifiez votre adresse e-mail &mdash; un lien de confirmation vous a été envoyé.
      </span>

      {status === 'sent' && (
        <span style={{ fontWeight: 700 }}>E-mail envoyé.</span>
      )}

      {status === 'rate-limited' && (
        <span style={{ fontWeight: 700 }}>
          Veuillez patienter avant de renvoyer l&apos;e-mail.
        </span>
      )}

      {(status === 'idle' || status === 'pending') && (
        <button
          onClick={handleResend}
          disabled={status === 'pending'}
          className="ep-btn-secondary"
          style={{
            fontSize: 13,
            padding: '6px 14px',
            minHeight: 44,
            cursor: status === 'pending' ? 'not-allowed' : undefined,
          }}
        >
          Renvoyer l&apos;e-mail
        </button>
      )}
    </div>
  );
}
