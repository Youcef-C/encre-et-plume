'use client';

// DR-3 FE-2 — Work page hero. Replica of prototype ŒUVRE lines 854-878 (back link, cover, badges,
// title, stat row, action buttons, admin moderation bar).
import Link from 'next/link';
import type { WorkDetail, AccountSummary } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { ratingLabel } from '../../lib/work';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { CheckIcon, HeartIcon, StarIcon, PlusIcon, ShareIcon, FlagIcon, ShieldIcon, BanIcon } from '../icons';

const badgeStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '2px 9px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const actionBase: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 6,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '3px 3px 0 var(--shadow)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'inherit',
};

export default function WorkHero({ work, account }: { work: WorkDetail; account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);

  return (
    <div>
      <Link href="/decouvrir" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
        ‹ Catalogue
      </Link>

      <div style={{ display: 'flex', gap: 26, marginTop: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: 240,
            height: 330,
            flex: 'none',
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '7px 7px 0 var(--shadow)',
            overflow: 'hidden',
            ...coverStyle(work.id, work.cover),
          }}
        />

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
            {work.complete && (
              <span style={badgeStyle}>
                <CheckIcon size={11} /> Complet
              </span>
            )}
            <span style={badgeStyle}>{work.genre}</span>
            <span style={{ ...badgeStyle, background: 'var(--accent)', color: '#fff' }}>
              {work.format.toUpperCase()}
            </span>
          </div>

          <h1 style={{ fontSize: 48, textTransform: 'uppercase', margin: 0, lineHeight: 0.95 }}>{work.title}</h1>
          <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, margin: '8px 0 14px' }}>{work.meta}</div>

          <div style={{ display: 'flex', gap: 24, marginBottom: 16, fontSize: 14, flexWrap: 'wrap' }}>
            <span aria-label={`${formatLikeCount(work.likeCount)} j'aime`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <b>{formatLikeCount(work.likeCount)}</b>
              <span style={{ color: 'var(--ink2)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <HeartIcon size={12} style={{ color: 'var(--accent)' }} /> j&apos;aime
              </span>
            </span>
            <span>
              <b>{formatLikeCount(work.readCount)}</b> <span style={{ color: 'var(--ink2)', fontSize: 12 }}>lectures</span>
            </span>
            <span aria-label={`${formatLikeCount(work.favoriteCount)} favoris`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <b>{formatLikeCount(work.favoriteCount)}</b>
              <span style={{ color: 'var(--ink2)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <StarIcon size={12} style={{ color: 'var(--accent)' }} /> favoris
              </span>
            </span>
            <span>
              <b>{ratingLabel(work.ratingAvg)}</b>{' '}
              <span style={{ color: 'var(--ink2)', fontSize: 12 }}>/5 · {work.reviewCount} avis</span>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href={`/lecteur/${work.slug}`}
              style={{ ...actionBase, background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
            >
              Lire
            </Link>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)' }}>
              <PlusIcon size={14} /> Ma liste
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)' }}>
              <StarIcon size={14} style={{ color: 'var(--accent)' }} /> Soutenir
            </button>
            <button
              type="button"
              onClick={trigger}
              style={{ ...actionBase, background: 'var(--ink)', color: 'var(--paper)', boxShadow: '3px 3px 0 var(--accent)' }}
            >
              Proposer une collab
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)', padding: '12px 16px' }}>
              <ShareIcon size={14} /> Partager
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)', padding: '12px 16px' }}>
              <FlagIcon size={14} /> Signaler
            </button>
          </div>

          {notice && (
            <p role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
              Bientôt disponible
            </p>
          )}

          {account?.role === 'admin' && (
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                flexWrap: 'wrap',
                border: '3px solid var(--ink)',
                borderRadius: 10,
                padding: '10px 14px',
                background: '#16130f',
                color: '#f1ece1',
                boxShadow: '4px 4px 0 var(--accent)',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.05em',
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 5,
                  padding: '3px 9px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <ShieldIcon size={12} /> MODÉRATION
              </span>
              <span style={{ fontSize: 12, color: '#cabfb2', fontWeight: 500 }}>
                Visible par les admins uniquement
              </span>
              <Link
                href="/admin"
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  fontWeight: 700,
                  border: '2px solid #f1ece1',
                  color: '#f1ece1',
                  borderRadius: 6,
                  padding: '7px 13px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <FlagIcon size={12} /> Révoquer l&apos;œuvre
              </Link>
              <button
                type="button"
                onClick={trigger}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  border: '2px solid #f1ece1',
                  color: '#f1ece1',
                  background: 'transparent',
                  borderRadius: 6,
                  padding: '7px 13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <BanIcon size={12} /> Bannir l&apos;auteur·rice
              </button>
              <Link
                href="/admin"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--accent)',
                  color: '#fff',
                  border: '2px solid #f1ece1',
                  borderRadius: 6,
                  padding: '7px 13px',
                  textDecoration: 'none',
                }}
              >
                ↪ Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
