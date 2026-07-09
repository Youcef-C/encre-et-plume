'use client';

// DR-12 (2026-07-09) — illustration-detail Collections box. A sidebar card (matches ArtistSidebar)
// listing the collections this illustration belongs to as gallery-style cover cards (same look as the
// Galerie CollectionCardsGrid), each a focusable <Link> to the collection Œuvre. The owner also gets a
// "Gérer les collections" button opening ManageCollectionsModal to add/create/remove membership; the
// display cards stay display-only. The illustration's own hashtags remain owned by EditIllustrationForm.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AccountSummary, CollectionChip, IllustrationDetail } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import ManageCollectionsModal from './ManageCollectionsModal';

// Overlay arrow — absolute, vertically centred on the carousel edge (like HeroCarousel), not beside the card.
function overlayArrow(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    [side]: -6,
    transform: 'translateY(-50%)',
    zIndex: 2,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    background: 'var(--card)',
    color: 'var(--ink)',
    border: '2px solid var(--ink)',
    borderRadius: '50%',
    boxShadow: '2px 2px 0 var(--shadow)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
  };
}

export default function IllustrationCollections({
  detail,
  account,
  onCollectionsChanged,
}: {
  detail: IllustrationDetail;
  account: AccountSummary | null;
  /** Owner-only: called with the new membership after a save so the parent refreshes detail.collections. */
  onCollectionsChanged?: (collections: CollectionChip[]) => void;
}) {
  const isOwner = !!account && account.id === detail.artist.id;
  const collections = detail.collections ?? [];
  const [manageOpen, setManageOpen] = useState(false);

  // Horizontally scrollable strip: all cards render; ~2 are visible; the user swipes (touch/
  // trackpad) or drags (mouse) through them, and the overlay arrows page by ~2. Arrow visibility
  // is driven by the real scroll position (measured from the ref), so each hides at the true end.
  const stripRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState({ prev: false, next: false });
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 1;
    setArrows({
      prev: overflow && el.scrollLeft > 1,
      next: overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows, collections.length]);

  function scrollByPage(dir: 1 | -1) {
    // Scroll by roughly the visible width (~2 cards); scroll-snap settles the strip on a card.
    stripRef.current?.scrollBy({ left: dir * (stripRef.current.clientWidth || 240), behavior: 'smooth' });
  }

  // Mouse pointer-drag to scroll (touch/trackpad already scroll natively). A drag that actually
  // moved swallows the click so it doesn't follow the card's link.
  function onPointerDown(e: React.PointerEvent) {
    const el = stripRef.current;
    if (!el || e.pointerType === 'touch') return; // let native touch scrolling handle touch
    drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = stripRef.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startLeft - dx;
  }
  function endDrag() {
    drag.current.down = false;
  }
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  // A visitor on an illustration with no collections sees nothing (no empty label noise).
  if (!isOwner && collections.length === 0) return null;

  return (
    <div style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '5px 5px 0 var(--shadow)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink2)' }}>COLLECTIONS</span>
        {collections.length > 0 && (
          <Link
            // All of this user's collections, browsed in the Galerie via the exact creator-slug
            // filter (artist=Account.profileSlug) — not the profile, not the global collections view.
            href={`/galerie?category=collections&artist=${encodeURIComponent(detail.artist.slug ?? '')}`}
            className="ep-voir-tout"
            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}
          >
            Voir tout <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      {collections.length > 0 ? (
        // Gallery-style cover cards (mirrors CollectionCardsGrid) in a horizontally scrollable strip:
        // ~2 visible, all reachable by swipe/drag; arrows OVERLAY the edges (HeroCarousel style) and
        // page by ~2, hiding at the true start/end.
        <div style={{ position: 'relative' }}>
          <div
            ref={stripRef}
            data-testid="collections-strip"
            className="ep-hscroll"
            role="group"
            aria-label="Collections"
            tabIndex={0}
            onScroll={updateArrows}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClickCapture={onClickCapture}
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              // overflow-x:auto also clips the Y axis — pad so the cards' 5px offset shadow isn't cut
              // (which made them look shadowless above the "Gérer les collections" button).
              paddingBottom: 8,
              paddingRight: 6,
              scrollSnapType: 'x mandatory',
              cursor: 'grab',
              touchAction: 'pan-x',
            }}
          >
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/oeuvre/${c.slug}`}
                className="ep-gallery-card"
                style={{
                  // ~2 cards visible at once (half the strip minus half the gap); the rest scroll in.
                  flex: '0 0 calc(50% - 6px)',
                  scrollSnapAlign: 'start',
                  display: 'block',
                  border: '3px solid var(--ink)',
                  borderRadius: 8,
                  boxShadow: '5px 5px 0 var(--shadow)',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: 'block', width: '100%', aspectRatio: '3 / 4', borderBottom: '3px solid var(--ink)', ...coverStyle(c.id, c.cover) }}
                />
                <b style={{ display: 'block', padding: '8px 10px', fontSize: 13, lineHeight: 1.2 }}>{c.title}</b>
              </Link>
            ))}
          </div>
          {/* Arrows simply disappear at the start/end rather than dimming. */}
          {arrows.prev && (
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              aria-label="Collections précédentes"
              className="ep-carousel-arrow"
              style={overlayArrow('left')}
            >
              <ChevronLeftIcon size={16} />
            </button>
          )}
          {arrows.next && (
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              aria-label="Collections suivantes"
              className="ep-carousel-arrow"
              style={overlayArrow('right')}
            >
              <ChevronRightIcon size={16} />
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>Aucune collection</p>
      )}

      {isOwner && (
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 12,
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '9px 14px',
            minHeight: 44,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '3px 3px 0 var(--shadow)',
          }}
        >
          Gérer les collections
        </button>
      )}

      {manageOpen && (
        <ManageCollectionsModal
          illustrationId={detail.id}
          currentCollections={collections}
          onClose={() => setManageOpen(false)}
          onSaved={(next) => onCollectionsChanged?.(next)}
        />
      )}
    </div>
  );
}
