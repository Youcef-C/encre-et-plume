// F-13: Shared legal document renderer — manga-zine style, server-renderable.
// content is trusted HTML from the backend seed (not user input).

import type { LegalDocumentDto } from '@encre-et-plume/shared';

interface Props {
  doc?: LegalDocumentDto;
  error?: string;
}

export default function LegalPage({ doc, error }: Props) {
  if (error ?? !doc) {
    return (
      <div style={{ maxWidth: 760, margin: '80px auto', padding: '0 24px 64px' }}>
        <div className="ep-card" style={{ padding: '32px 40px' }}>
          <p style={{ color: 'var(--ink2)', fontSize: 15, margin: 0 }}>
            {error ?? 'Contenu indisponible pour le moment.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '48px auto', padding: '0 24px 64px' }}>
      <div
        className="ep-card ep-legal-content"
        style={{ padding: '40px 48px' }}
        // ponytail: trusted team/seed HTML — not user-generated content
        dangerouslySetInnerHTML={{ __html: doc.content }}
      />
      <p
        style={{
          marginTop: 12,
          fontSize: 12,
          color: 'var(--ink2)',
          textAlign: 'right',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Version {doc.version} — {new Date(doc.publishedAt).toLocaleDateString('fr-FR')}
      </p>
    </div>
  );
}
