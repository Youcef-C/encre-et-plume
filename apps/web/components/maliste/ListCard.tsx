'use client';

// DR-8 F4 — "Ma liste" card. Replica of prototype MA LISTE lines 2035-2038: halftone cover,
// bottom-edge accent progress overlay when started, "✕" remove badge. The remove button is a
// sibling of the Link (not nested inside it) — same pattern as GalleryCard's eye button, since a
// <button> inside an <a> is invalid HTML and breaks keyboard/AT behavior.
import Link from 'next/link';
import type { ListItemDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { XIcon } from '../icons';

export default function ListCard({
  item,
  onRemove,
}: {
  item: ListItemDto;
  onRemove: (slug: string) => void;
}) {
  const started = item.lastChapterNumber != null;
  const href = started
    ? `/lecteur/${item.slug}?chapitre=${item.lastChapterNumber}${item.page != null ? `&page=${item.page}` : ''}`
    : `/lecteur/${item.slug}`;

  return (
    <div style={{ position: 'relative' }}>
      <Link href={href} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
        <div
          style={{
            position: 'relative',
            height: 212,
            border: '3px solid var(--ink)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '4px 4px 0 var(--shadow)',
            ...coverStyle(item.slug, item.cover),
          }}
          role="img"
          aria-label={item.title}
        >
          {started && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progressPercent}
              aria-label={`Progression : ${item.progressPercent}% — Ch. ${item.lastChapterNumber} / ${item.totalChapters}`}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 7,
                background: 'rgba(255,255,255,.35)',
              }}
            >
              <div style={{ display: 'block', height: '100%', width: `${item.progressPercent}%`, background: 'var(--accent)' }} />
            </div>
          )}
        </div>
        <div style={{ fontWeight: 700, marginTop: 9 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
          {started ? `Reprendre · Ch. ${item.lastChapterNumber} / ${item.totalChapters}` : 'Pas commencé'}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onRemove(item.slug)}
        aria-label="Retirer de ma liste"
        className="ep-malist-remove"
        style={{
          position: 'absolute',
          top: 9,
          right: 9,
          zIndex: 3,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--card)',
          border: '2px solid var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <XIcon size={13} />
      </button>
    </div>
  );
}
