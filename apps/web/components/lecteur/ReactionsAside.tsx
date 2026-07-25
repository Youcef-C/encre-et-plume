'use client';

// DR-4 FE-6 — right "Réactions" aside. Replica of LECTEUR lines 826-845.
// DR-9 FE5: ♥ (chapter like) and ★ (work save) are now real toggles via `useReaction`; the
// comment composer stays on the `usePersonalAction` stub (PUB-2, out of scope).
import { useState } from 'react';
import type { AccountSummary } from '@encre-et-plume/shared';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { useReaction } from '../../lib/useReaction';
import { formatLikeCount } from '../../lib/home';
import { HeartIcon, StarIcon, ArrowUpIcon, CollapseLeftIcon, CollapseRightIcon } from '../icons';

type Props = {
  workSlug: string;
  chapterId: string;
  likeCount: number;
  favoriteCount: number;
  liked: boolean;
  saved: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  account: AccountSummary | null;
};

const asideStyle: React.CSSProperties = {
  width: 200,
  flex: 'none',
  background: '#221d18',
  border: '3px solid #4a4239',
  borderRadius: 8,
  padding: 13,
  color: '#cabfb2',
};

const pillBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  background: '#2c261f',
  border: '2px solid #4a4239',
  borderRadius: 6,
  padding: '5px 11px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function ReactionsAside({ workSlug, chapterId, likeCount, favoriteCount, liked, saved, collapsed, onToggleCollapsed, account }: Props) {
  const { trigger, notice } = usePersonalAction(account);
  const [draft, setDraft] = useState('');
  const like = useReaction({ targetType: 'chapter', targetId: chapterId, kind: 'like', account, initialActive: liked, initialCount: likeCount });
  const save = useReaction({ targetType: 'work', targetId: workSlug, kind: 'save', account, initialActive: saved, initialCount: favoriteCount });

  if (collapsed) {
    return (
      <aside className="ep-reader-aside" style={{ ...asideStyle, width: 48 }}>
        <button
          type="button"
          className="ep-aside-rail-btn"
          onClick={onToggleCollapsed}
          aria-label="Développer"
          title="Développer"
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', color: '#cabfb2', fontFamily: 'inherit' }}
        >
          <CollapseLeftIcon size={16} style={{ color: '#fff' }} />
          <span className="ep-aside-rail-label" style={{ writingMode: 'vertical-rl', fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '.08em' }}>
            Réactions
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside data-side="right" className="ep-reader-aside" style={asideStyle}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Réduire"
          title="Réduire"
          style={{ cursor: 'pointer', width: 28, height: 28, border: '2px solid #4a4239', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cabfb2', background: 'none', marginRight: 'auto' }}
        >
          <CollapseRightIcon size={14} />
        </button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', color: '#fff' }}>Réactions</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={like.toggle}
          aria-pressed={like.active}
          aria-label={like.active ? "Retirer le j'aime" : "J'aime"}
          style={pillBtn}
        >
          <HeartIcon size={14} style={{ color: like.active ? 'var(--accent)' : undefined }} /> {formatLikeCount(like.count)}
        </button>
        <button
          type="button"
          onClick={save.toggle}
          aria-pressed={save.active}
          aria-label={save.active ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
          style={pillBtn}
        >
          <StarIcon size={14} style={{ color: save.active ? 'var(--accent)' : undefined }} /> {formatLikeCount(save.count)}
        </button>
      </div>

      {notice && (
        <p role="status" style={{ fontSize: 11, color: '#cabfb2', fontWeight: 700, margin: '0 0 10px' }}>
          Bientôt disponible
        </p>
      )}

      {(like.error || save.error) && (
        <p role="alert" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, margin: '0 0 10px' }}>
          Une erreur est survenue, réessayez.
        </p>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#fff' }}>Commentaires</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11 }}>
        <p style={{ fontSize: 12, color: '#8d8478', margin: 0 }}>Aucun commentaire pour l&apos;instant.</p>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          aria-label="Commenter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Commenter…"
          style={{ flex: 1, minWidth: 0, background: '#2c261f', border: '2px solid #4a4239', borderRadius: 6, padding: '6px 9px', color: '#fff', fontSize: 12, fontFamily: 'inherit' }}
        />
        <button
          type="button"
          onClick={trigger}
          aria-label="Envoyer le commentaire"
          className="ep-btn-primary"
          style={{ fontSize: 12, fontWeight: 700, border: '2px solid var(--ink)', padding: '6px 11px', cursor: 'pointer' }}
        >
          <ArrowUpIcon size={12} />
        </button>
      </div>
    </aside>
  );
}
