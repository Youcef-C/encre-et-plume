'use client';

// DR-4 — "★ MES FAVORIS" quick-switch menu content. Extracted from Topbar so the same list can
// be reused by the "Plein écran" immersive bottom bar's compact favorites switch (ImmersiveBar)
// without duplicating the favorites list rendering.
import Link from 'next/link';
import type { FavoriteWorkDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';

type Props = {
  favorites: FavoriteWorkDto[];
  signedIn: boolean;
};

export default function FavoritesMenu({ favorites, signedIn }: Props) {
  return (
    <div
      style={{
        width: 240,
        background: '#221d18',
        border: '3px solid #4a4239',
        borderRadius: 8,
        boxShadow: '5px 5px 0 rgba(0,0,0,.5)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#8d8478', borderBottom: '2px solid #4a4239' }}>
        ★ MES FAVORIS
      </div>
      {!signedIn && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: '#cabfb2' }}>
          <Link href="/connexion" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Se connecter
          </Link>{' '}
          pour voir vos favoris.
        </div>
      )}
      {signedIn && favorites.length === 0 && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: '#cabfb2' }}>Aucun favori pour l&apos;instant.</div>
      )}
      {signedIn &&
        favorites.map((fav) => (
          <Link
            key={fav.slug}
            href={`/lecteur/${fav.slug}`}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: '1.5px solid #2c261f', textDecoration: 'none' }}
          >
            <span aria-hidden="true" style={{ width: 26, height: 34, border: '2px solid #4a4239', borderRadius: 3, flex: 'none', ...coverStyle(fav.slug, fav.cover) }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fav.title}</div>
              <div style={{ fontSize: 11, color: '#cabfb2' }}>{fav.meta}</div>
            </div>
          </Link>
        ))}
    </div>
  );
}
