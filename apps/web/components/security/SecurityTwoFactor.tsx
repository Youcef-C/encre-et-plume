'use client';

// F-18: Security block — 2FA enable/disable flow (TOTP, strictly opt-in).
// Self-contained so F-19 can re-home it without edits.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  getSecurityOverview,
  twoFactorSetup,
  twoFactorConfirm,
  twoFactorDisable,
} from '../../lib/api';
import type { ApiError, TwoFactorSetupResponse } from '@encre-et-plume/shared';
import { TWO_FACTOR_INVALID_CODE } from '@encre-et-plume/shared';

type TfaState = 'loading' | 'disabled' | 'setup' | 'codes' | 'enabled';

// Reuse focus-trap pattern
function trapFocus(e: React.KeyboardEvent, ref: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !ref.current) return;
  const els = Array.from(
    ref.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

export default function SecurityTwoFactor() {
  const [tfaState, setTfaState] = useState<TfaState>('loading');
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable modal
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const disableTriggerRef = useRef<HTMLButtonElement>(null);

  // Load overview
  useEffect(() => {
    getSecurityOverview()
      .then((ov) => setTfaState(ov.twoFactorEnabled ? 'enabled' : 'disabled'))
      .catch(() => setTfaState('disabled')); // fail-open to disabled
  }, []);

  // Generate QR when we have a provisioning URI
  useEffect(() => {
    if (!setupData?.provisioningUri) return;
    QRCode.toDataURL(setupData.provisioningUri, { margin: 2, width: 200 })
      .then((url) => setQrUrl(url))
      .catch(() => setQrUrl(null));
  }, [setupData?.provisioningUri]);

  // Focus disable dialog
  useEffect(() => {
    if (disableOpen) {
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>('input')?.focus();
      });
    } else {
      disableTriggerRef.current?.focus();
    }
  }, [disableOpen]);

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      const data = await twoFactorSetup();
      setSetupData(data);
      setTfaState('setup');
    } catch {
      // stay on disabled
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);
    try {
      const res = await twoFactorConfirm({ code: confirmCode });
      setBackupCodes(res.backupCodes);
      setTfaState('codes');
      setConfirmCode('');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === TWO_FACTOR_INVALID_CODE) {
        setConfirmError('Code invalide.');
      } else {
        setConfirmError(apiErr.message ?? 'Une erreur est survenue.');
      }
    }
  };

  const handleAckCodes = () => {
    setBackupCodes([]);
    setSetupData(null);
    setQrUrl(null);
    setTfaState('enabled');
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisableError(null);
    setDisableLoading(true);
    try {
      await twoFactorDisable({ password: disablePassword, code: disableCode });
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      setTfaState('disabled');
    } catch (err) {
      const apiErr = err as ApiError;
      setDisableError(apiErr.message ?? 'Une erreur est survenue.');
    } finally {
      setDisableLoading(false);
    }
  };

  if (tfaState === 'loading') {
    return (
      <div
        className="ep-skeleton-delayed"
        aria-hidden="true"
        style={{ height: 40, background: 'var(--tone)', borderRadius: 6 }}
      />
    );
  }

  return (
    <div>
      {/* Status badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
          Statut :{' '}
          <strong style={{ color: tfaState === 'enabled' ? 'var(--ink)' : 'var(--ink2)' }}>
            {tfaState === 'enabled' || tfaState === 'codes' ? 'Activée' : 'Désactivée'}
          </strong>
        </p>

        {tfaState === 'disabled' && (
          <button
            type="button"
            className="ep-btn-primary"
            onClick={() => void handleSetup()}
            disabled={setupLoading}
            style={{ fontSize: 14, padding: '10px 18px', minHeight: 44 }}
          >
            {setupLoading ? 'Chargement…' : 'Activer'}
          </button>
        )}

        {tfaState === 'enabled' && (
          <button
            ref={disableTriggerRef}
            type="button"
            className="ep-btn-secondary"
            onClick={() => setDisableOpen(true)}
            style={{ fontSize: 14, padding: '10px 18px', minHeight: 44 }}
          >
            Désactiver
          </button>
        )}
      </div>

      {/* ── Setup step: QR + manual secret + confirm code ── */}
      {tfaState === 'setup' && setupData && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 16px' }}>
            Scannez ce QR code avec votre application TOTP (Authy, Google Authenticator, etc.)
            ou saisissez le secret manuellement.
          </p>

          {/* QR code */}
          {qrUrl && (
            <div style={{ marginBottom: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- CLAUDE.md: no next/image; plain <img> required */}
              <img
                src={qrUrl}
                alt="QR code d'activation 2FA"
                aria-label="QR code"
                width={200}
                height={200}
                style={{ border: '2px solid var(--border)', borderRadius: 4, display: 'block' }}
              />
            </div>
          )}

          {/* Copyable secret — a11y text alternative */}
          <div
            style={{
              marginBottom: 20,
              background: 'var(--tone)',
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink2)' }}>Secret :</p>
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                letterSpacing: '0.1em',
                userSelect: 'all',
                flex: 1,
              }}
            >
              {setupData.secret}
            </code>
            <button
              type="button"
              className="ep-btn-secondary"
              onClick={() => void navigator.clipboard.writeText(setupData.secret)}
              style={{ fontSize: 12, padding: '6px 12px' }}
              aria-label="Copier le secret"
            >
              Copier
            </button>
          </div>

          {/* Confirm code form */}
          <form onSubmit={(e) => void handleConfirm(e)} noValidate>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="totp-confirm-code" className="ep-label">
                Code de vérification
              </label>
              <input
                id="totp-confirm-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
                className="ep-input"
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', maxWidth: 200 }}
                required
              />
            </div>
            {confirmError && (
              <p role="alert" className="ep-error" style={{ marginBottom: 10 }}>
                {confirmError}
              </p>
            )}
            <button
              type="submit"
              className="ep-btn-primary"
              disabled={confirmCode.length < 6}
              style={{ fontSize: 14, padding: '10px 18px', minHeight: 44 }}
            >
              Confirmer
            </button>
          </form>
        </div>
      )}

      {/* ── Backup codes (shown once) ── */}
      {tfaState === 'codes' && (
        <div>
          <div
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 16,
            }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--accent)',
              }}
            >
              Conservez-les précieusement — ils ne seront plus affichés.
            </p>
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            {backupCodes.map((code) => (
              <li
                key={code}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  background: 'var(--tone)',
                  borderRadius: 4,
                  padding: '8px 12px',
                  userSelect: 'all',
                  textAlign: 'center',
                }}
              >
                {code}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ep-btn-primary"
            onClick={handleAckCodes}
            style={{ fontSize: 14, padding: '10px 18px', minHeight: 44 }}
          >
            J&apos;ai enregistré mes codes
          </button>
        </div>
      )}

      {/* ── Disable modal ── */}
      {disableOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => { if (!disableLoading) setDisableOpen(false); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(22,19,15,0.65)',
              zIndex: 60,
            }}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-2fa-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !disableLoading) setDisableOpen(false);
              trapFocus(e, dialogRef);
            }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 61,
              width: 'min(440px, calc(100vw - 32px))',
              background: 'var(--card)',
              border: '3px solid var(--ink)',
              borderRadius: 8,
              boxShadow: '6px 6px 0 var(--shadow)',
              padding: '28px 32px',
            }}
          >
            <h2
              id="disable-2fa-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                margin: '0 0 14px',
                color: 'var(--ink)',
              }}
            >
              Désactiver la double authentification
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 20px' }}>
              Saisissez votre mot de passe et un code TOTP ou de secours pour confirmer.
            </p>
            <form onSubmit={(e) => void handleDisable(e)} noValidate>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="disable-2fa-password" className="ep-label">
                  Mot de passe
                </label>
                <input
                  id="disable-2fa-password"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="ep-input"
                  required
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="disable-2fa-code" className="ep-label">
                  Code de vérification
                </label>
                <input
                  id="disable-2fa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  className="ep-input"
                  required
                />
              </div>
              {disableError && (
                <p role="alert" className="ep-error" style={{ marginBottom: 10 }}>
                  {disableError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  className="ep-btn-primary"
                  disabled={disableLoading || !disablePassword || !disableCode}
                  style={{ flex: 1, fontSize: 14 }}
                >
                  {disableLoading ? 'Désactivation…' : 'Confirmer la désactivation'}
                </button>
                <button
                  type="button"
                  className="ep-btn-secondary"
                  onClick={() => setDisableOpen(false)}
                  disabled={disableLoading}
                  style={{ flex: 1, fontSize: 14 }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
