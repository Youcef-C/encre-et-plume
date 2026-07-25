'use client';

// DR-6 FE-T4 (FE-6, FE-7, FE-8, FE-11) — sticky sidebar: artist card, "Détails", "Plus de cet·te
// artiste". Replica of prototype ILLUSTRATION lines 710-737. One file for the three always-
// co-rendered sidebar sections (mirrors oeuvre/Sidebar.tsx's ponytail choice).
import { useState } from 'react';
import Link from 'next/link';
import type { IllustrationArtist, GalleryIllustrationCard, AccountSummary } from '@encre-et-plume/shared';
import { usePersonalAction } from '../../lib/usePersonalAction';
import InviteModal, { type InviteRecipient } from '../collab/InviteModal';
import { formatPublishedDate } from '../../lib/illustration';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { BrushIcon, PlusIcon, StarIcon, MailIcon, HeartIcon } from '../icons';

const sidebarCard: React.CSSProperties = {
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '5px 5px 0 var(--shadow)',
  padding: 16,
};

export default function ArtistSidebar({
  artist,
  categoryLabel,
  publishedAt,
  dimensionsLabel,
  tools,
  license,
  more,
  account,
  editAction,
  belowDetails,
}: {
  artist: IllustrationArtist;
  categoryLabel: string;
  publishedAt: string | null;
  dimensionsLabel: string | null;
  tools: string | null;
  license: string;
  more: GalleryIllustrationCard[];
  account: AccountSummary | null;
  /** DR-12 (2026-07-09): owner-only illustration-edit action rendered INSIDE the Détails card. */
  editAction?: React.ReactNode;
  /** DR-12 (2026-07-09): content slotted directly UNDER Détails, above "Plus de cet·te artiste"
   *  (the Collections box). */
  belowDetails?: React.ReactNode;
}) {
  const { trigger, notice } = usePersonalAction(account);

  // MC-3 — "Proposer une collab" opens the invite modal for a linked artist (has an Account id).
  // Unlinked fixtures (id === null) keep the deferred stub; anonymous → /connexion (via trigger).
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleProposer = () => {
    if (!account || !artist.id) {
      trigger();
      return;
    }
    setInviteOpen(true);
  };
  const recipient: InviteRecipient | null = artist.id
    ? {
        userId: artist.id,
        name: artist.name,
        avatarUrl: artist.avatar,
        subtitle: [artist.role, artist.city].filter(Boolean).join(' · '),
      }
    : null;

  const rows: [string, string][] = [
    ['Catégorie', categoryLabel],
    ['Publié', formatPublishedDate(publishedAt)],
    ['Dimensions', dimensionsLabel ?? '—'],
    ['Outils', tools ?? '—'],
    ['Licence', license],
  ];

  return (
    <aside
      className="ep-illustration-sidebar"
      style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={sidebarCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '2px solid var(--ink)',
              flex: 'none',
              ...(artist.avatar
                ? { backgroundImage: `url(${artist.avatar})`, backgroundSize: 'cover' }
                : {
                    backgroundColor: 'var(--tone)',
                    backgroundImage: 'radial-gradient(var(--ink) 1.4px,transparent 1.5px)',
                    backgroundSize: '5px 5px',
                  }),
            }}
          />
          <div style={{ minWidth: 0 }}>
            {artist.slug ? (
              <Link href={`/${artist.slug}`} style={{ fontSize: 16, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>
                {artist.name}
              </Link>
            ) : (
              <b style={{ fontSize: 16 }}>{artist.name}</b>
            )}
            <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <BrushIcon size={12} /> {artist.role}
              {artist.city ? ` · ${artist.city}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={trigger}
            className="ep-btn-secondary"
            style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, borderRadius: 6, padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            <PlusIcon size={13} /> Suivre
          </button>
          <button
            type="button"
            onClick={trigger}
            className="ep-btn-primary"
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              padding: 8,
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--shadow)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              fontFamily: 'inherit',
            }}
          >
            <StarIcon size={13} /> Soutenir
          </button>
        </div>
        <button
          type="button"
          onClick={handleProposer}
          className="ep-btn-dark"
          style={{
            display: 'flex',
            width: '100%',
            textAlign: 'center',
            marginTop: 8,
            fontSize: 13,
            fontWeight: 700,
            border: '2px solid var(--ink)',
            padding: 8,
            cursor: 'pointer',
            boxShadow: '2px 2px 0 var(--accent)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            fontFamily: 'inherit',
          }}
        >
          <MailIcon size={13} /> Proposer une collab
        </button>
        {inviteOpen && recipient && (
          <InviteModal recipient={recipient} onClose={() => setInviteOpen(false)} />
        )}
        {notice && (
          <p role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--ink2)', fontWeight: 700, textAlign: 'center' }}>
            Bientôt disponible
          </p>
        )}
      </div>

      <div style={sidebarCard}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', marginBottom: 12 }}>
          Détails
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex' }}>
              <span style={{ color: 'var(--ink2)' }}>{label}</span>
              <b style={{ marginLeft: 'auto' }}>{value}</b>
            </div>
          ))}
        </div>
        {editAction && <div style={{ marginTop: 14 }}>{editAction}</div>}
      </div>

      {belowDetails}

      {more.length > 0 && (
        <div style={sidebarCard}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase' }}>
              Plus de cet·te artiste
            </div>
            {/* CS-13 / DR-6: browse ALL of this artist's illustrations in the Galerie (artist facet). */}
            {artist.slug && (
              <Link
                href={`/galerie?artist=${encodeURIComponent(artist.slug)}`}
                className="ep-voir-tout"
                style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}
              >
                Voir tout <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {more.map((item) => (
              <Link
                key={item.id}
                href={`/illustration/${item.id}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <div
                  role="img"
                  aria-label={item.title}
                  style={{ height: 96, border: '2px solid var(--ink)', borderRadius: 6, ...coverStyle(item.id, item.thumbnail) }}
                />
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <b>{item.title}</b>
                  <span
                    aria-label={`${formatLikeCount(item.likeCount)} j'aime`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 5, color: 'var(--ink2)' }}
                  >
                    <HeartIcon size={10} style={{ color: 'var(--accent)' }} /> {formatLikeCount(item.likeCount)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
