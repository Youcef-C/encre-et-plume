'use client';

// CS-2 — deep-linkable placeholder for tabs whose real screens ship in later stories
// (Chapitres→CS-7, Fichiers→CS-3, Discussion→CS-8, Soutien→MR epic). On-brand bordered card;
// the panel body is the only thing those stories replace.
export default function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ padding: '16px 18px' }}>
      <div
        style={{
          border: '3px solid var(--ink)',
          borderRadius: 10,
          boxShadow: '4px 4px 0 var(--shadow)',
          background: 'var(--card)',
          padding: '28px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            border: '3px solid var(--ink)',
            background:
              'var(--paper) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{note}</div>
      </div>
    </div>
  );
}
