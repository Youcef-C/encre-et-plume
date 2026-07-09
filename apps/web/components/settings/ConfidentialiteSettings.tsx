'use client';

// F-19 "Confidentialité" — the DM-privacy control ("Qui peut m'envoyer des messages"). An on-brand
// OnBrandSelect (never a native select) over `dmPolicy` (anyone / requests / contacts). MC-9 routes a
// new non-contact DM on this preference. Auto-applies on change (no "Appliquer" button — convention)
// via PATCH /accounts/me/preferences, then refreshes the session so the value persists across mounts.
import { useEffect, useRef, useState } from 'react';
import { DM_POLICY_DEFAULT, type DmPolicy } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { updateMyPreferences } from '../../lib/api';
import OnBrandSelect from '../form/OnBrandSelect';

const DM_POLICY_LABELS: Record<DmPolicy, string> = {
  anyone: 'Tout le monde',
  requests: 'Demandes de message',
  contacts: 'Contacts uniquement',
};

export default function ConfidentialiteSettings() {
  const { account, refresh } = useSession();
  const [value, setValue] = useState<DmPolicy>(account?.preferences.dmPolicy ?? DM_POLICY_DEFAULT);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the control in sync if the session account changes underneath (e.g. a background refresh).
  useEffect(() => {
    if (account) setValue(account.preferences.dmPolicy);
  }, [account]);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  if (!account) return null;

  async function apply(next: DmPolicy) {
    const previous = value;
    setValue(next); // optimistic
    setError(false);
    setSaved(false);
    try {
      await updateMyPreferences({ dmPolicy: next });
      await refresh();
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 4000);
    } catch {
      setValue(previous); // revert
      setError(true);
    }
  }

  return (
    <div>
      <label htmlFor="dm-policy" className="ep-label">
        Qui peut m&apos;envoyer des messages
      </label>
      <OnBrandSelect
        id="dm-policy"
        value={value}
        aria-label="Qui peut m'envoyer des messages"
        onChange={(e) => void apply(e.target.value as DmPolicy)}
      >
        <option value="anyone">{DM_POLICY_LABELS.anyone}</option>
        <option value="requests">{DM_POLICY_LABELS.requests}</option>
        <option value="contacts">{DM_POLICY_LABELS.contacts}</option>
      </OnBrandSelect>
      <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '10px 0 0', lineHeight: 1.55 }}>
        Détermine comment un message d&apos;un membre hors de vos contacts vous parvient.
      </p>
      {saved && (
        <p role="status" style={{ fontSize: 14, color: 'var(--ink2)', margin: '10px 0 0' }}>
          Préférence enregistrée.
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 700, margin: '10px 0 0' }}>
          Enregistrement impossible. Réessayez.
        </p>
      )}
    </div>
  );
}
