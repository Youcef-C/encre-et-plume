// DR-3 FE-3 — Synopsis + hashtags + roman-only prose excerpt. Replica of ŒUVRE lines 886-891.
import type { WorkDetail } from '@encre-et-plume/shared';

export default function SynopsisBlock({ work }: { work: WorkDetail }) {
  const showExcerpt = work.format === 'Roman' && !!work.proseExcerpt;

  return (
    <div>
      <h2 style={{ fontSize: 24, textTransform: 'uppercase', margin: '0 0 10px' }}>Synopsis</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 14px' }}>{work.synopsis}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 26, fontSize: 12, fontWeight: 700 }}>
        {work.hashtags.map((tag) => (
          <span key={tag} style={{ background: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 5, padding: '3px 10px' }}>
            #{tag}
          </span>
        ))}
      </div>

      {showExcerpt && (
        <div
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 10,
            background: 'var(--card)',
            boxShadow: '3px 3px 0 var(--shadow)',
            padding: '20px 22px',
            marginBottom: 26,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: 10 }}>
            Extrait · Chapitre 1
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--ink)' }}>{work.proseExcerpt}</p>
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>
            Lire la suite →
          </div>
        </div>
      )}
    </div>
  );
}
