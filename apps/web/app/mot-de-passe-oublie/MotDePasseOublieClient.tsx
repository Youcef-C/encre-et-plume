'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ApiError } from '@encre-et-plume/shared';
import { requestPasswordReset } from '../../lib/api';

type FormState = 'idle' | 'submitting' | 'sent' | 'rate-limited';

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
};

export default function MotDePasseOublieClient() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>('idle');
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setEmailError('E-mail requis');
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    setFormState('submitting');
    try {
      await requestPasswordReset({ email });
      setFormState('sent');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr?.error === 'RATE_LIMITED' || apiErr?.statusCode === 429) {
        setFormState('rate-limited');
      } else {
        // Any other error: still show the non-enumerating confirmation (AC-F2)
        setFormState('sent');
      }
    }
  };

  const backLink = (
    <p style={{ textAlign: 'center', fontSize: 14, marginTop: 20 }}>
      <Link
        href="/connexion"
        style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
      >
        Retour à la connexion
      </Link>
    </p>
  );

  if (formState === 'sent') {
    return (
      <div style={OUTER}>
        <div className="ep-card" style={{ ...CARD, textAlign: 'center' }}>
          <div role="status" aria-live="polite">
            <p style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 24 }}>
              Si un compte existe pour cette adresse, un e-mail de réinitialisation a été envoyé.
            </p>
            {backLink}
          </div>
        </div>
      </div>
    );
  }

  if (formState === 'rate-limited') {
    return (
      <div style={OUTER}>
        <div className="ep-card" style={{ ...CARD, textAlign: 'center' }}>
          <div role="status" aria-live="polite">
            <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 24 }}>
              Trop de tentatives. Réessayez plus tard.
            </p>
            {backLink}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={OUTER}>
      <div className="ep-card" style={CARD}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            textTransform: 'uppercase',
            lineHeight: 0.9,
            marginBottom: 8,
          }}
        >
          Mot de passe oublié
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 28 }}>
          Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="reset-email" className="ep-label">
              E-mail
            </label>
            <input
              ref={emailRef}
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'reset-email-error' : undefined}
              className="ep-input"
            />
            {emailError && (
              <span id="reset-email-error" className="ep-error" role="alert">
                {emailError}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={formState === 'submitting'}
            className="ep-btn-primary"
            style={{ width: '100%', fontSize: 16, marginBottom: 20 }}
          >
            {formState === 'submitting' ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>

        {backLink}
      </div>
    </div>
  );
}
