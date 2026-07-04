// DR-11 F-b — resume progress bar under the WorkHero CTA. Accent-on-ink fill, design-system
// borders. French indicator "Ch. N · {Titre} — page X/Y" (F3); role="progressbar" (F6).
type Props = {
  chapterNumber: number;
  workTitle: string;
  page: number;
  totalPages: number;
};

export default function ResumeProgress({ chapterNumber, workTitle, page, totalPages }: Props) {
  const pct = totalPages > 0 ? Math.min(100, Math.max(0, Math.round((page / totalPages) * 100))) : 0;
  const label = `Ch. ${chapterNumber} · ${workTitle} — page ${page}/${totalPages}`;

  return (
    <div style={{ marginTop: 10, width: '100%', maxWidth: 460 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalPages}
        aria-valuenow={page}
        aria-label={`Progression : Ch. ${chapterNumber} · ${workTitle} — page ${page} sur ${totalPages}`}
        style={{
          width: '100%',
          height: 10,
          border: '3px solid var(--ink)',
          borderRadius: 6,
          background: 'var(--ink)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
      <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{label}</div>
    </div>
  );
}
