'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import type { ApiError } from '@encre-et-plume/shared';
import { PASSWORD_RESET_TOKEN_INVALID, PASSWORD_RESET_TOKEN_EXPIRED } from '@encre-et-plume/shared';
import { confirmPasswordReset } from '../../lib/api';

interface FieldErrors {
  newPassword?: string;
  confirmPassword?: string;
}

type PageState = 'idle' | 'submitting' | 'success' | 'error';

function validate(newPassword: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!newPassword) {
    errors.newPassword = 'Mot de passe requis';
  } else if (newPassword.length < 8) {
    errors.newPassword = 'Le mot de passe doit contenir au moins 8 caractères';
  }
  // Only check confirm if newPassword itself is valid
  if (!errors.newPassword && confirmPassword !== newPassword) {
    errors.confirmPassword = 'Les mots de passe ne correspondent pas';
  }
  return errors;
}

const OUTER: React.CSSProperties = {
  minHeight: 'calc(100dvh - 69px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 16px',
  background: 'var(--paper)',
};

const CARD: React.CSSProperties = { width: '100%', maxWidth: 440, padding: '40px 36px' };

const backToRequestLink = (
  <Link
    href="/mot-de-passe-oublie"
    style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
  >
    Demander un nouveau lien
  </Link>
);

export default function ReinitialiserMotDePasseClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // No token → immediately error; token present → idle form
  const [pageState, setPageState] = useState<PageState>(token ? 'idle' : 'error');

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors = validate(newPassword, confirmPassword);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.newPassword) newPasswordRef.current?.focus();
      else if (errors.confirmPassword) confirmPasswordRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setPageState('submitting');
    try {
      await confirmPasswordReset({ token, newPassword });
      setPageState('success');
      // Redirect to login after a brief moment so the user reads the message (AC-F3)
      setTimeout(() => router.push('/connexion'), 2000);
    } catch (err) {
      const apiErr = err as ApiError;
      // Both INVALID and EXPIRED map to the same UI copy per the spec
      if (
        apiErr?.error === PASSWORD_RESET_TOKEN_INVALID ||
        apiErr?.error === PASSWORD_RESET_TOKEN_EXPIRED
      ) {
        setPageState('error');
      } else {
        setPageState('error');
      }
    }
  };

  if (pageState === 'error') {
    return (
      <div style={OUTER}>
        <div className="ep-card" style={{ ...CARD, textAlign: 'center' }}>
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
              Ce lien de réinitialisation n&apos;est plus valide ou a déjà été utilisé.
            </p>
            {backToRequestLink}
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div style={OUTER}>
        <div className="ep-card" style={{ ...CARD, textAlign: 'center' }}>
          <div role="status" aria-live="polite">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 16,
              }}
            >
              Mot de passe mis à jour
            </h1>
            <p style={{ color: 'var(--ink2)', fontSize: 15 }}>
              Mot de passe mis à jour — reconnectez-vous.
            </p>
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
          Réinitialiser le mot de passe
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 28 }}>
          Choisissez un nouveau mot de passe pour votre compte.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="new-password" className="ep-label">
              Nouveau mot de passe
            </label>
            <input
              ref={newPasswordRef}
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={!!fieldErrors.newPassword}
              aria-describedby={fieldErrors.newPassword ? 'new-password-error' : undefined}
              className="ep-input"
            />
            {fieldErrors.newPassword && (
              <span id="new-password-error" className="ep-error" role="alert">
                {fieldErrors.newPassword}
              </span>
            )}
          </div>

          <div style={{ marginBottom: 28 }}>
            <label htmlFor="confirm-password" className="ep-label">
              Confirmer le mot de passe
            </label>
            <input
              ref={confirmPasswordRef}
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
              className="ep-input"
            />
            {fieldErrors.confirmPassword && (
              <span id="confirm-password-error" className="ep-error" role="alert">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={pageState === 'submitting'}
            className="ep-btn-primary"
            style={{ width: '100%', fontSize: 16 }}
          >
            {pageState === 'submitting' ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
