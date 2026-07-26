'use client';

import { useSession } from '../lib/session';
import { useEffectiveRole } from '../lib/role';
import { CheckIcon } from './icons';

export default function RoleBanner() {
  const { account } = useSession();
  const { effectiveRole } = useEffectiveRole();

  if (effectiveRole !== 'editor') return null;

  return (
    <div
      role="status"
      aria-label="Connecté en tant qu'éditeur"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 28px',
        background: 'var(--ink)',
        color: '#f1ece1',
        fontSize: 13,
        fontWeight: 700,
        borderBottom: '2px solid var(--accent)',
      }}
    >
      <span>◆</span>
      <span>Connecté·e en tant qu&apos;Éditeur · Maison partenaire</span>
      {account?.verified === true && (
        <span
          aria-label="Compte vérifié"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 8,
            background: '#1f8a5b',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            border: '2px solid #f1ece1',
            borderRadius: 5,
            padding: '2px 8px',
          }}
        >
          <CheckIcon size={12} />
          compte vérifié
        </span>
      )}
    </div>
  );
}
