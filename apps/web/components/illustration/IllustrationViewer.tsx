'use client';

// DR-6 FE-T2 (FE-2, FE-3, FE-9, FE-10, FE-11) — artwork viewer, action bar, fullscreen, admin bar.
// Replica of prototype ILLUSTRATION lines 656-673.
import { useState } from 'react';
import Link from 'next/link';
import type { IllustrationDetail, AccountSummary } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { HeartIcon, PlusIcon, FullscreenIcon, ShareIcon, FlagIcon, ShieldIcon, BanIcon } from '../icons';
import IllustrationFullscreen from './IllustrationFullscreen';

const actionBase: React.CSSProperties = {
  border: '2px solid var(--ink)',
  borderRadius: 7,
  padding: '9px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--shadow)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
};

export default function IllustrationViewer({ detail, account }: { detail: IllustrationDetail; account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div>
      <div style={{ position: 'relative', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '6px 6px 0 var(--shadow)', overflow: 'hidden' }}>
        <div role="img" aria-label={detail.title} style={{ width: '100%', height: 600, ...coverStyle(detail.id, detail.image) }} />
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          title="Voir en plein écran"
          aria-label="Voir en plein écran"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 7,
            border: '2px solid var(--ink)',
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '2px 2px 0 var(--shadow)',
            cursor: 'zoom-in',
          }}
        >
          <FullscreenIcon size={15} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={trigger} style={actionBase}>
          <HeartIcon size={14} /> J&apos;aime
        </button>
        <button type="button" onClick={trigger} style={actionBase}>
          <PlusIcon size={14} /> Enregistrer
        </button>
        <button type="button" onClick={() => setFullscreen(true)} style={actionBase}>
          <FullscreenIcon size={14} /> Plein écran
        </button>
        <button type="button" onClick={trigger} style={actionBase}>
          <ShareIcon size={14} /> Partager
        </button>
        <button type="button" onClick={trigger} style={actionBase}>
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
          <span style={{ fontSize: 12, color: '#cabfb2', fontWeight: 500 }}>Visible par les admins uniquement</span>
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
            <FlagIcon size={12} /> Révoquer l&apos;illustration
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

      {fullscreen && <IllustrationFullscreen detail={detail} onClose={() => setFullscreen(false)} />}
    </div>
  );
}
