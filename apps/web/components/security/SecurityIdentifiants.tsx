'use client';

// F-18: Security block — change email + change password.
// Self-contained so F-19 can re-home it without edits.

import { useEffect, useState } from 'react';
import { changeEmail, changePassword, getSecurityOverview } from '../../lib/api';
import type { ApiError } from '@encre-et-plume/shared';
import { INVALID_PASSWORD } from '@encre-et-plume/shared';

type EmailState = 'idle' | 'saving' | 'pending' | 'error';
type PasswordState = 'idle' | 'saving' | 'success' | 'error';

export default function SecurityIdentifiants() {
  // --- email form ---
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailState, setEmailState] = useState<EmailState>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // --- password form ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwState, setPwState] = useState<PasswordState>('idle');
  const [pwError, setPwError] = useState<string | null>(null);

  // Seed pending email state from overview on mount
  useEffect(() => {
    getSecurityOverview()
      .then((ov) => { if (ov.pendingEmail) setPendingEmail(ov.pendingEmail); })
      .catch(() => {}); // best-effort
  }, []);

  // --- email submit ---
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailState('saving');
    try {
      const res = await changeEmail({ newEmail, password: emailPassword });
      setPendingEmail(res.pendingEmail);
      setEmailState('pending');
      setNewEmail('');
      setEmailPassword('');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === INVALID_PASSWORD) {
        setEmailError('Mot de passe incorrect.');
      } else {
        setEmailError(apiErr.message ?? 'Une erreur est survenue.');
      }
      setEmailState('error');
    }
  };

  // --- password submit ---
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError('Les mots de passe ne correspondent pas.');
      return;
    }
    setPwState('saving');
    try {
      await changePassword({ currentPassword, newPassword });
      setPwState('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === INVALID_PASSWORD) {
        setPwError('Mot de passe incorrect.');
      } else {
        setPwError(apiErr.message ?? 'Une erreur est survenue.');
      }
      setPwState('error');
    }
  };

  return (
    <div>
      {/* ── E-mail sub-form ───────────────────────────────────────── */}
      <div
        style={{
          paddingBottom: 24,
          marginBottom: 24,
          borderBottom: '1.5px solid var(--border)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            margin: '0 0 16px',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Modifier l&apos;adresse e-mail
        </h3>

        {pendingEmail && emailState !== 'idle' && emailState !== 'error' ? (
          // Show pending state persistently after success or on mount if pending
          <div
            role="status"
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '12px 16px',
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            <strong>En attente de confirmation :</strong>{' '}
            <strong>{pendingEmail}</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--ink2)' }}>
              Un e-mail de confirmation a été envoyé à{' '}
              <strong>{pendingEmail}</strong>. Votre adresse changera après confirmation.
            </p>
          </div>
        ) : pendingEmail && emailState === 'idle' ? (
          // Mount: pendingEmail from overview, show notice
          <div
            role="status"
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            <strong>En attente de confirmation :</strong>{' '}
            <strong>{pendingEmail}</strong>
          </div>
        ) : null}

        <form
          onSubmit={(e) => void handleEmailSubmit(e)}
          noValidate
          aria-label="Modifier l'adresse e-mail"
        >
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="new-email" className="ep-label">
              Nouvelle adresse e-mail
            </label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="ep-input"
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="email-current-password" className="ep-label">
              Mot de passe actuel
            </label>
            <input
              id="email-current-password"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              className="ep-input"
              required
            />
          </div>
          {emailError && (
            <p role="alert" className="ep-error" style={{ marginBottom: 10 }}>
              {emailError}
            </p>
          )}
          <button
            type="submit"
            className="ep-btn-primary"
            disabled={emailState === 'saving' || !newEmail || !emailPassword}
            style={{ fontSize: 14, padding: '10px 18px' }}
          >
            {emailState === 'saving' ? 'Enregistrement…' : 'Enregistrer l\'e-mail'}
          </button>
        </form>
      </div>

      {/* ── Password sub-form ─────────────────────────────────────── */}
      <div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            margin: '0 0 16px',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Modifier le mot de passe
        </h3>

        {pwState === 'success' && (
          <div
            role="status"
            style={{
              background: 'var(--accent-soft)',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            Mot de passe mis à jour.{' '}
            Vos autres sessions ont été déconnectées.
          </div>
        )}

        <form
          onSubmit={(e) => void handlePasswordSubmit(e)}
          noValidate
          aria-label="Modifier le mot de passe"
        >
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="current-password" className="ep-label">
              Mot de passe actuel
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="ep-input"
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="new-password" className="ep-label">
              Nouveau mot de passe
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="ep-input"
              minLength={8}
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="confirm-password" className="ep-label">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="ep-input"
              required
            />
          </div>
          {pwError && (
            <p role="alert" className="ep-error" style={{ marginBottom: 10 }}>
              {pwError}
            </p>
          )}
          <button
            type="submit"
            className="ep-btn-primary"
            disabled={pwState === 'saving' || !currentPassword || !newPassword || !confirmPassword}
            style={{ fontSize: 14, padding: '10px 18px' }}
          >
            {pwState === 'saving' ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
