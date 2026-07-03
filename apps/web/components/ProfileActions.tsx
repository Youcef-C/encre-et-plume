'use client';

// F-7 — Visitor action buttons. Presentational stubs — no wired behavior yet.
// PUB-4 = Suivre, MC-8 = Se connecter, MR-1 = Soutenir, MC-3 = Proposer une collab.
import { StarIcon } from './icons';

export default function ProfileActions() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        Suivre
      </button>
      <button
        type="button"
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        ＋ Se connecter
      </button>
      <button
        type="button"
        className="ep-btn-primary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <StarIcon size={14} /> Soutenir
        </span>
      </button>
      <button
        type="button"
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        Proposer une collab
      </button>
    </div>
  );
}
