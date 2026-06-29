'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError } from '@encre-et-plume/shared';
import { signup } from '../lib/api';
import { useSession } from '../lib/session';

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
}

// French client-side validation (mirrors server rules)
function validate(displayName: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!displayName.trim()) errors.displayName = 'Le nom est requis';
  if (!email.trim()) {
    errors.email = 'E-mail requis';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'E-mail invalide';
  }
  if (!password) {
    errors.password = 'Mot de passe requis';
  } else if (password.length < 8) {
    errors.password = 'Minimum 8 caractères';
  }
  return errors;
}

export default function SignupForm() {
  const router = useRouter();
  const { refresh } = useSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Refs for focus management on error (FE-7)
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const fieldRefs = {
    displayName: displayNameRef,
    email: emailRef,
    password: passwordRef,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors = validate(displayName, email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Move focus to first invalid field (FE-7)
      const firstKey = (Object.keys(errors) as (keyof FieldErrors)[])[0];
      if (firstKey) fieldRefs[firstKey].current?.focus();
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      await signup({ displayName, email, password });
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
    <form onSubmit={handleSubmit} noValidate aria-label="Formulaire d'inscription">
      {/* Server-level error banner */}
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

      {/* Display name */}
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="displayName" className="ep-label">
          Nom d&apos;affichage
        </label>
        <input
          ref={displayNameRef}
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={!!fieldErrors.displayName}
          aria-describedby={fieldErrors.displayName ? 'displayName-error' : undefined}
          className="ep-input"
        />
        {fieldErrors.displayName && (
          <span id="displayName-error" className="ep-error" role="alert">
            {fieldErrors.displayName}
          </span>
        )}
      </div>

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
      <div style={{ marginBottom: 28 }}>
        <label htmlFor="password" className="ep-label">
          Mot de passe
        </label>
        <input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
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

      <button
        type="submit"
        disabled={loading}
        className="ep-btn-primary"
        style={{ width: '100%', fontSize: 16 }}
      >
        {loading ? 'Création…' : 'Créer mon compte'}
      </button>
    </form>
  );
}
