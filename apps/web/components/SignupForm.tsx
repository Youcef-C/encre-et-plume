'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError } from '@encre-et-plume/shared';
import { signup } from '../lib/api';
import { useSession } from '../lib/session';

interface FieldErrors {
  displayName?: string;
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
}

const USERNAME_RE = /^[a-z0-9-]{3,30}$/;

// Same slugify rules as the API's SlugService (NFD diacritics-strip → lowercase → hyphenate).
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// French client-side validation (mirrors server rules)
function validate(
  displayName: string,
  email: string,
  username: string,
  password: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!displayName.trim()) errors.displayName = 'Le nom est requis';
  if (!email.trim()) {
    errors.email = 'E-mail requis';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'E-mail invalide';
  }
  if (username && !USERNAME_RE.test(username)) {
    errors.username =
      "Nom d'utilisateur invalide : 3 à 30 caractères (lettres minuscules, chiffres, tirets)";
  }
  if (!password) {
    errors.password = 'Mot de passe requis';
  } else if (password.length < 8) {
    errors.password = 'Minimum 8 caractères';
  }
  if (password && confirmPassword !== password) {
    errors.confirmPassword = 'Les mots de passe ne correspondent pas.';
  }
  return errors;
}

export default function SignupForm() {
  const router = useRouter();
  const { refresh } = useSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  // Once the user edits the handle manually, stop suggesting it from the display name.
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Refs for focus management on error (FE-7)
  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const fieldRefs = {
    displayName: displayNameRef,
    email: emailRef,
    username: usernameRef,
    password: passwordRef,
    confirmPassword: confirmPasswordRef,
  };

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    if (!usernameTouched) setUsername(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors = validate(displayName, email, username, password, confirmPassword);
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
      // Only the password is sent — the confirmation is a client-side check.
      await signup({
        displayName,
        email,
        password,
        ...(username ? { username } : {}),
      });
      await refresh();
      router.push('/');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === 'USERNAME_TAKEN') {
        setFieldErrors({ username: apiErr.message });
        usernameRef.current?.focus();
      } else {
        setServerError(apiErr.message ?? 'Une erreur est survenue');
      }
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
          onChange={(e) => handleDisplayNameChange(e.target.value)}
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

      {/* Username (@handle) — suggested from the display name until manually edited */}
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="username" className="ep-label">
          Nom d&apos;utilisateur (@)
        </label>
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontWeight: 700,
              color: 'var(--ink)',
              pointerEvents: 'none',
            }}
          >
            @
          </span>
          <input
            ref={usernameRef}
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsernameTouched(true);
              setUsername(e.target.value);
            }}
            aria-invalid={!!fieldErrors.username}
            aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            className="ep-input"
            style={{ paddingLeft: 32 }}
          />
        </div>
        {fieldErrors.username && (
          <span id="username-error" className="ep-error" role="alert">
            {fieldErrors.username}
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

      {/* Confirm password — client-side check only, never sent */}
      <div style={{ marginBottom: 28 }}>
        <label htmlFor="confirmPassword" className="ep-label">
          Confirmer le mot de passe
        </label>
        <input
          ref={confirmPasswordRef}
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={!!fieldErrors.confirmPassword}
          aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
          className="ep-input"
        />
        {fieldErrors.confirmPassword && (
          <span id="confirmPassword-error" className="ep-error" role="alert">
            {fieldErrors.confirmPassword}
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
