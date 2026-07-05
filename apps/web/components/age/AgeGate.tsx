'use client';

// DR-10 FE-3 — 18+ interstitial. Reuses Paywall.tsx's dialog scaffolding (absolute overlay,
// role="dialog" aria-modal aria-labelledby, Escape handling) plus a focus trap and initial focus
// on the title. Branches on the current viewer (useSession) — see plan.md FE-3 for the four cases.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '../../lib/session';
import { clearAge } from '../../lib/ageGate';
import * as api from '../../lib/api';
import OnBrandCheckbox from '../form/OnBrandCheckbox';

type Props = {
  onBack: () => void;
};

export default function AgeGate({ onBack }: Props) {
  const { account, refresh } = useSession();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [remember, setRemember] = useState(false);
  const [birthdate, setBirthdate] = useState('');
  const [birthdateError, setBirthdateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // User-specified 2026-07-05: a true modal — the page behind must not scroll while the
  // interstitial is up. Restore whatever overflow value was already set on unmount/refusal.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus trap + Escape-to-back (mirrors Paywall.tsx's Escape handling, plus Tab wrapping since
  // this overlay isn't a native <dialog>).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onBack();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const list = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], input');
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  function handleContinue() {
    clearAge(account, remember);
  }

  async function handleBirthdateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!birthdate) {
      setBirthdateError('Date invalide');
      return;
    }
    setBirthdateError(null);
    setSubmitting(true);
    try {
      await api.updateMyBirthdate(birthdate);
      await refresh();
    } catch {
      setBirthdateError('Date invalide');
    } finally {
      setSubmitting(false);
    }
  }

  const isAdult = account?.isAdult;

  return (
    <div
      data-testid="age-gate-backdrop"
      style={{
        // User-specified 2026-07-05: fullscreen viewport-fixed backdrop (not just the page's own
        // content wrapper) so it can never be scrolled past, but stopping below the sticky navbar
        // (68px header + border, matching the `calc(100vh - 69px)` convention used elsewhere) so
        // it never overlays the nav — and the underlying page is scroll-locked (see the
        // document.body.style.overflow effect above).
        position: 'fixed',
        top: 69,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
        // Presentation update (user-specified 2026-07-05): the page now shows BLURRED behind this
        // overlay (see OeuvreClient/Reader/IllustrationClient) instead of a flat dark backdrop, so
        // the scrim is lightened to let it show through while the dialog box stays fully opaque.
        background: 'rgba(22,19,15,.45)',
        zIndex: 50,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ep-age-gate-title"
        style={{
          background: 'var(--card)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          borderRadius: 10,
          boxShadow: '6px 6px 0 var(--shadow)',
          padding: 24,
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <h2
          id="ep-age-gate-title"
          ref={titleRef}
          tabIndex={-1}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            textTransform: 'uppercase',
            margin: '4px 0 12px',
            lineHeight: 1.1,
            outline: 'none',
          }}
        >
          Contenu réservé aux adultes (18+)
        </h2>

        {account === null && (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 18px', color: 'var(--ink2)' }}>
              Ce contenu est réservé aux personnes majeures. Confirmez votre âge pour continuer.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleContinue} className="ep-btn-primary">
                J&apos;ai 18 ans ou plus — continuer
              </button>
              <button type="button" onClick={onBack} className="ep-btn-secondary">
                Retour
              </button>
            </div>
            <p style={{ fontSize: 13, marginTop: 16, color: 'var(--ink2)' }}>
              Vous avez un compte ?{' '}
              <Link href="/connexion" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                Se connecter
              </Link>
            </p>
          </>
        )}

        {account && isAdult === false && (
          <>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 18px' }}>
              Ce contenu est réservé aux adultes.
            </p>
            <button type="button" onClick={onBack} className="ep-btn-secondary">
              Retour
            </button>
          </>
        )}

        {account && isAdult === true && (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--ink2)' }}>
              Ce contenu est réservé aux personnes majeures. Confirmez votre âge pour continuer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <OnBrandCheckbox
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                label="Ne plus me demander"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleContinue} className="ep-btn-primary">
                J&apos;ai 18 ans ou plus — continuer
              </button>
              <button type="button" onClick={onBack} className="ep-btn-secondary">
                Retour
              </button>
            </div>
          </>
        )}

        {account && isAdult === null && (
          <form onSubmit={handleBirthdateSubmit}>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 14px', color: 'var(--ink2)' }}>
              Indiquez votre date de naissance pour accéder à ce contenu.
            </p>
            <div style={{ textAlign: 'left', marginBottom: 14 }}>
              <label htmlFor="age-gate-birthdate" className="ep-label">
                Date de naissance
              </label>
              <input
                id="age-gate-birthdate"
                name="birthdate"
                type="date"
                autoComplete="bday"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                aria-invalid={!!birthdateError}
                aria-describedby={birthdateError ? 'age-gate-birthdate-error' : undefined}
                className="ep-input"
              />
              {birthdateError && (
                <span id="age-gate-birthdate-error" className="ep-error" role="alert">
                  {birthdateError}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="submit" disabled={submitting} className="ep-btn-primary">
                {submitting ? 'Vérification…' : 'Continuer'}
              </button>
              <button type="button" onClick={onBack} className="ep-btn-secondary">
                Retour
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
