'use client';

// DR-10 — Paramètres "Contenu 18+" section: shows the current isAdult status derived from the
// account's birthdate, lets the viewer set/update that birthdate (PATCH /accounts/me/birthdate),
// and revoke the remembered "Ne plus me demander" clearance on this device (lib/ageGate.ts).
import { useState } from 'react';
import { isPlausibleBirthdate } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { updateMyBirthdate } from '../../lib/api';
import { revokeAge, useAgeCleared } from '../../lib/ageGate';

export default function AdultContentSettings() {
  const { account, refresh } = useSession();
  const cleared = useAgeCleared(account);
  const [birthdate, setBirthdate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revoked, setRevoked] = useState(false);

  if (!account) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (!birthdate || !isPlausibleBirthdate(birthdate)) {
      setError('Date invalide');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateMyBirthdate(birthdate);
      await refresh();
      setSaved(true);
      setBirthdate('');
    } catch {
      setError('Date invalide');
    } finally {
      setSaving(false);
    }
  }

  function handleRevoke() {
    revokeAge(account);
    setRevoked(true);
  }

  const statusText =
    account.isAdult === true
      ? 'Vous avez accès au contenu réservé aux adultes (18+).'
      : account.isAdult === false
        ? 'Accès restreint : votre profil indique que vous êtes mineur·e.'
        : 'Date de naissance non renseignée.';

  return (
    <div>
      <p role="status" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 18px', color: 'var(--ink)' }}>
        {statusText}
      </p>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-label="Accès au contenu 18+"
        style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1.5px solid var(--border)' }}
      >
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="adult-content-birthdate" className="ep-label">
            Date de naissance
          </label>
          <input
            id="adult-content-birthdate"
            name="birthdate"
            type="date"
            autoComplete="bday"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'adult-content-birthdate-error' : undefined}
            className="ep-input"
          />
          {error && (
            <span id="adult-content-birthdate-error" className="ep-error" role="alert">
              {error}
            </span>
          )}
        </div>
        {saved && (
          <p role="status" style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 12px' }}>
            Date de naissance mise à jour.
          </p>
        )}
        <button
          type="submit"
          className="ep-btn-primary"
          disabled={saving || !birthdate}
          style={{ fontSize: 14, padding: '10px 18px' }}
        >
          {saving ? 'Enregistrement…' : account.isAdult === null ? 'Définir' : 'Mettre à jour'}
        </button>
      </form>

      {account.isAdult === true && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 14px', lineHeight: 1.55 }}>
            Si vous avez coché « Ne plus me demander » lors d&apos;un précédent accès à du contenu
            18+, cette confirmation est mémorisée sur cet appareil. Réinitialisez-la pour qu&apos;elle
            vous soit de nouveau demandée.
          </p>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={!cleared}
            className="ep-btn-secondary"
            style={{ fontSize: 14, padding: '10px 18px' }}
          >
            Réactiver la confirmation 18+ sur cet appareil
          </button>
          {revoked && (
            <p role="status" style={{ fontSize: 14, color: 'var(--ink2)', margin: '12px 0 0' }}>
              Confirmation réinitialisée sur cet appareil.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
