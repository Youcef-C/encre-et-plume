'use client';

// DR-6 FE-T3 (FE-5, FE-10, FE-11) — comments section. Replica of prototype ILLUSTRATION lines
// 685-706. No comment list data exists this round (PUB-2 owns it) — the empty state + a labeled
// stub composer are the honest DR-6 surfaces (flagged in frontend-notes).
import type { AccountSummary } from '@encre-et-plume/shared';
import { usePersonalAction } from '../../lib/usePersonalAction';

export default function IllustrationComments({ account }: { account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);

  return (
    <div>
      <h2 style={{ fontSize: 22, textTransform: 'uppercase', margin: '0 0 12px' }}>
        Commentaires <span style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>· 0</span>
      </h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <span
          aria-hidden="true"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '2px solid var(--ink)',
            flex: 'none',
            backgroundColor: 'var(--tone)',
            backgroundImage: 'radial-gradient(var(--ink) 1.3px,transparent 1.4px)',
            backgroundSize: '5px 5px',
          }}
        />
        <div style={{ flex: 1, display: 'flex', gap: 8 }}>
          <label htmlFor="illustration-comment-composer" className="sr-only">
            Ajouter un commentaire
          </label>
          <input
            id="illustration-comment-composer"
            placeholder="Ajouter un commentaire…"
            style={{
              flex: 1,
              border: '2px solid var(--ink)',
              borderRadius: 8,
              padding: '9px 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              background: 'var(--card)',
              color: 'var(--ink)',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={trigger}
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 7,
              padding: '9px 16px',
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--shadow)',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            Publier
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" style={{ marginBottom: 12, fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
          Bientôt disponible
        </p>
      )}

      <p style={{ fontSize: 14, color: 'var(--ink2)' }}>
        Aucun commentaire pour le moment. Soyez le·la premier·ère à réagir.
      </p>
    </div>
  );
}
