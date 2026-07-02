'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ApiError } from '@encre-et-plume/shared';
import { login } from '../lib/api';
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      await login({ email, password, rememberMe });
      await refresh();
      router.push('/');
    } catch (err) {
      const apiErr = err as ApiError;
      setServerError(apiErr.message ?? 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Formulaire de connexion">
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
