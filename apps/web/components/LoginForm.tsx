'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EMAIL_NOT_VERIFIED, TWO_FACTOR_CHALLENGE_INVALID, TWO_FACTOR_INVALID_CODE } from '@encre-et-plume/shared';
import type { ApiError } from '@encre-et-plume/shared';
import { login, twoFactorVerify } from '../lib/api';
import { useSession } from '../lib/session';

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) {
    errors.email = 'E-mail requis';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'E-mail invalide';
  }
  if (!password) errors.password = 'Mot de passe requis';
  return errors;
}

export default function LoginForm() {
  const router = useRouter();
  const { refresh } = useSession();

  // Step 1: credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 2: 2FA
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaError, setTfaError] = useState<string | null>(null);
  const [tfaLoading, setTfaLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const res = await login({ email, password, rememberMe });
      if ('twoFactorRequired' in res) {
        // 2FA required: swap to code step
        setChallengeToken(res.challengeToken);
        setLoading(false);
        return;
      }
      await refresh();
      router.push('/');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === EMAIL_NOT_VERIFIED) {
        router.push(
          '/verifier-email/envoye?email=' +
            encodeURIComponent(email) +
            '&reason=login',
        );
      } else {
        setServerError(apiErr.message ?? 'Une erreur est survenue');
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setTfaError(null);
    setTfaLoading(true);
    try {
      await twoFactorVerify({ challengeToken, code: tfaCode });
      await refresh();
      router.push('/');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === TWO_FACTOR_CHALLENGE_INVALID) {
        // Challenge expired — reset to step 1
        setChallengeToken(null);
        setTfaCode('');
        setUseBackupCode(false);
        setServerError(apiErr.message ?? 'Session expirée, reconnectez-vous.');
      } else if (apiErr.error === TWO_FACTOR_INVALID_CODE) {
        setTfaError('Code invalide.');
      } else {
        setTfaError(apiErr.message ?? 'Une erreur est survenue.');
      }
    } finally {
      setTfaLoading(false);
    }
  };

  // ── Step 2: 2FA code form ──────────────────────────────────────────────────
  if (challengeToken) {
    return (
      <form onSubmit={(e) => void handle2FASubmit(e)} noValidate aria-label="Vérification 2FA">
        <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 20px' }}>
          Saisissez le code généré par votre application d&apos;authentification.
        </p>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="tfa-code" className="ep-label">
            {useBackupCode ? 'Code de secours' : 'Code de vérification'}
          </label>
          <input
            id="tfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={tfaCode}
            onChange={(e) => setTfaCode(e.target.value)}
            className="ep-input"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.15em' }}
            required
          />
        </div>

        {tfaError && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 20,
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {tfaError}
          </div>
        )}

        <button
          type="submit"
          disabled={tfaLoading || !tfaCode}
          className="ep-btn-primary"
          style={{ width: '100%', fontSize: 16, marginBottom: 14 }}
        >
          {tfaLoading ? 'Vérification…' : 'Vérifier'}
        </button>

        <button
          type="button"
          onClick={() => {
            setUseBackupCode((prev) => !prev);
            setTfaCode('');
            setTfaError(null);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {useBackupCode
            ? 'Utiliser un code de vérification'
            : 'Utiliser un code de secours'}
        </button>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => {
              setChallengeToken(null);
              setTfaCode('');
              setTfaError(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink2)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Retour à la connexion
          </button>
        </div>
      </form>
    );
  }

  // ── Step 1: credentials form ───────────────────────────────────────────────
  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Formulaire de connexion">
      {/* Server-level error */}
      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: 'var(--accent-soft)',
            border: '2px solid var(--accent)',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 20,
            color: 'var(--accent)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {serverError}
        </div>
      )}

      {/* Email */}
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="email" className="ep-label">
          E-mail
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          className="ep-input"
        />
        {fieldErrors.email && (
          <span id="email-error" className="ep-error" role="alert">
            {fieldErrors.email}
          </span>
        )}
      </div>

      {/* Password */}
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="password" className="ep-label">
          Mot de passe
        </label>
        <input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          className="ep-input"
        />
        {fieldErrors.password && (
          <span id="password-error" className="ep-error" role="alert">
            {fieldErrors.password}
          </span>
        )}
      </div>

      {/* Forgot password */}
      <div style={{ textAlign: 'right', marginTop: -10, marginBottom: 18 }}>
        <Link
          href="/mot-de-passe-oublie"
          style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          Mot de passe oublié ?
        </Link>
      </div>

      {/* Remember me */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          id="rememberMe"
          name="rememberMe"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <label
          htmlFor="rememberMe"
          style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer', color: 'var(--ink)' }}
        >
          Se souvenir de moi
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="ep-btn-primary"
        style={{ width: '100%', fontSize: 16 }}
      >
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
