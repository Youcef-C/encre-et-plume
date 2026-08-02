/**
 * Legal document loader — turns the editable `legal/*.md` sources into the trusted HTML the
 * `LegalDocument` rows serve. `legal/*.md` stays the single source of truth; the seed derives
 * from it so the published text and the repository text cannot drift.
 */

// ponytail: require() — legal-content.js is the CommonJS module prisma/seed.js consumes directly,
// so the test exercises the exact artifact the seed runs (no build step in between).
const legalContent = require('../../prisma/legal-content') as {
  LEGAL_VERSION: string;
  LEGAL_ROUTES: Record<string, string>;
  loadLegalDocuments: () => { kind: string; version: string; content: string }[];
};

const { LEGAL_VERSION, LEGAL_ROUTES, loadLegalDocuments } = legalContent;

describe('legal-content (seed source loader)', () => {
  const docs = loadLegalDocuments();
  const byKind = Object.fromEntries(docs.map((d) => [d.kind, d]));

  it('loads the four published documents, including the charte', () => {
    expect(docs.map((d) => d.kind).sort()).toEqual(['cgu', 'charte', 'mentions', 'privacy']);
  });

  it('maps every kind to the public route the footer links to', () => {
    expect(LEGAL_ROUTES).toEqual({
      cgu: '/cgu',
      privacy: '/confidentialite',
      mentions: '/mentions-legales',
      charte: '/charte',
    });
  });

  it('renders the real French title of each document as an <h1>', () => {
    // marked escapes `'` to `&#39;` — the assertions match the stored HTML, not the markdown.
    expect(byKind['cgu']!.content).toContain('<h1>Conditions générales d&#39;utilisation</h1>');
    expect(byKind['privacy']!.content).toContain('<h1>Politique de confidentialité</h1>');
    expect(byKind['mentions']!.content).toContain('<h1>Mentions légales</h1>');
    expect(byKind['charte']!.content).toContain('<h1>Charte de la communauté Encre &amp; Plume</h1>');
  });

  it('ships the real legal text, not the previous placeholder row', () => {
    for (const doc of docs) {
      expect(doc.content).not.toContain('[Contenu juridique à valider par l');
      expect(doc.content.length).toBeGreaterThan(3000);
    }
    // A sentence that only exists in the drafted CGU (article 3 — acceptance).
    expect(byKind['cgu']!.content).toContain(
      'L&#39;acceptation des CGU s&#39;effectue par une case à cocher distincte et non pré-cochée',
    );
    // The charte declares itself an integral part of the CGU — the reason it must be reachable.
    expect(byKind['charte']!.content).toContain('fait partie intégrante des');
  });

  it('stamps every document with the same published version', () => {
    for (const doc of docs) expect(doc.version).toBe(LEGAL_VERSION);
  });

  it('substitutes the [VERSION_*] placeholders with the published version', () => {
    expect(byKind['cgu']!.content).toContain(`Version ${LEGAL_VERSION}`);
    expect(byKind['charte']!.content).toContain(`Version ${LEGAL_VERSION}`);
    expect(byKind['privacy']!.content).toContain(`Version ${LEGAL_VERSION}`);
    for (const doc of docs) expect(doc.content).not.toMatch(/\[VERSION_/);
  });

  it('rewrites cross-document links to app routes, never to .md files', () => {
    expect(byKind['cgu']!.content).toContain('href="/charte"');
    expect(byKind['cgu']!.content).toContain('href="/confidentialite"');
    expect(byKind['cgu']!.content).toContain('href="/mentions-legales"');
    expect(byKind['charte']!.content).toContain('href="/cgu"');
    for (const doc of docs) expect(doc.content).not.toMatch(/href="[^"]*\.md"/);
  });

  it('drops the anchor for a document that is not published yet (politique cookies)', () => {
    const privacy = byKind['privacy']!.content;
    expect(privacy).toContain('Politique cookies');
    expect(privacy).not.toContain('politique-cookies');
  });

  it('flags the remaining [PLACEHOLDER] tokens so the draft status is visible', () => {
    expect(byKind['mentions']!.content).toContain(
      '<mark class="ep-legal-todo">[NOM_DE_LA_SOCIETE]</mark>',
    );
  });

  it('opens each document with the "à valider" draft notice', () => {
    for (const doc of docs) {
      expect(doc.content).toContain('ep-legal-draft');
      expect(doc.content).toContain('Version de travail');
    }
  });

  it('renders markdown tables as real <table> markup', () => {
    expect(byKind['privacy']!.content).toContain('<table>');
    expect(byKind['charte']!.content).toContain('<table>');
  });

  // Wide tables (the privacy processing register) must scroll inside their own box rather than
  // push the page into horizontal overflow at 375px.
  it('wraps every table in a scrollable container', () => {
    for (const doc of docs) {
      const tables = doc.content.match(/<table>/g)?.length ?? 0;
      const wrappers = doc.content.match(/<div class="ep-legal-table">/g)?.length ?? 0;
      expect(wrappers).toBe(tables);
      expect(doc.content).not.toMatch(/(?<!<div class="ep-legal-table">)<table>/);
    }
    expect(byKind['privacy']!.content).toContain('<div class="ep-legal-table"><table>');
    expect(byKind['privacy']!.content).toContain('</table></div>');
  });
});
