'use client';

// DR-3 FE-4 — Collapsible paginated chapter list. Replica of ŒUVRE lines 892-897.
import { useState } from 'react';
import Link from 'next/link';
import type { WorkChapterDto, WorkChaptersResponse } from '@encre-et-plume/shared';
import { WORK_CHAPTER_PREVIEW } from '@encre-et-plume/shared';
import { getWorkChapters } from '../../lib/api';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { chapterDateLabel } from '../../lib/work';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 13,
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '10px 13px',
  boxShadow: '2px 2px 0 var(--shadow)',
  textDecoration: 'none',
  color: 'inherit',
};

function ChapterRow({ slug, chapter }: { slug: string; chapter: WorkChapterDto }) {
  return (
    <Link href={`/lecteur/${slug}?chapitre=${chapter.number}`} style={rowStyle}>
      <span
        aria-hidden="true"
        style={{ width: 46, height: 60, flex: 'none', border: '2px solid var(--ink)', borderRadius: 4, ...coverStyle(chapter.id, null) }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Ch. {chapter.number}{chapter.title ? ` — ${chapter.title}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
          {chapter.plancheCount} planches · {chapterDateLabel(chapter.publishedAt)}
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink2)' }}>♥ {formatLikeCount(chapter.likeCount)}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Lire →</span>
    </Link>
  );
}

export default function ChapterList({ slug, initialData }: { slug: string; initialData: WorkChaptersResponse }) {
  const [items, setItems] = useState<WorkChapterDto[]>(initialData.items);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [total] = useState(initialData.total);
  const [expanded, setExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  if (total === 0) return null;

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (items.length < total && page < totalPages) {
      setLoadingMore(true);
      try {
        const next = await getWorkChapters(slug, page + 1);
        setItems((prev) => [...prev, ...next.items]);
        setPage(next.page);
        setTotalPages(next.totalPages);
      } finally {
        setLoadingMore(false);
      }
    }
  }

  const visible = expanded ? items : items.slice(0, WORK_CHAPTER_PREVIEW);
  const showToggle = total > WORK_CHAPTER_PREVIEW;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 24, textTransform: 'uppercase', margin: 0 }}>Chapitres</h2>
        <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>{total} · tous disponibles</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 26 }}>
        {visible.map((chapter) => (
          <ChapterRow key={chapter.id} slug={slug} chapter={chapter} />
        ))}
        {loadingMore && (
          <div role="status" style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink2)', padding: 6 }}>
            Chargement…
          </div>
        )}
        {showToggle && (
          <button
            type="button"
            onClick={() => void handleToggle()}
            aria-expanded={expanded}
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: 6,
              background: 'none',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            {expanded ? 'Réduire ▴' : `Voir les ${total} chapitres ▾`}
          </button>
        )}
      </div>
    </div>
  );
}
