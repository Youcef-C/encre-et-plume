'use strict';
/**
 * Legal document loader — the bridge between `legal/*.md` (the editable source of truth, reviewed
 * by the team) and the `LegalDocument` rows the API serves at `GET /legal/:kind`.
 *
 * `prisma/seed.js` calls `loadLegalDocuments()` and upserts the result, so publishing an amended
 * document is "edit the markdown, bump LEGAL_VERSION, reseed" — the two can never drift.
 *
 * The rendered HTML is trusted (team-authored, not user input) and goes straight into
 * `LegalPage`'s dangerouslySetInnerHTML — no sanitizer needed, and none is applied.
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

/**
 * Published version stamped on all four documents. The documents are drafts (placeholders are
 * still unfilled), hence the `-draft` suffix — bump to `2.0` when the team signs off.
 *
 * Bumping this re-triggers CGU re-consent for every existing account (see
 * `LegalService.needsCguReconsent`), which is the intended behaviour for an amended CGU.
 */
const LEGAL_VERSION = '1.1-draft';

/** Public route serving each kind — also what the in-document cross-links are rewritten to. */
const LEGAL_ROUTES = {
  cgu: '/cgu',
  privacy: '/confidentialite',
  mentions: '/mentions-legales',
  charte: '/charte',
};

/** Source file per kind, relative to `legal/`. */
const LEGAL_SOURCES = {
  cgu: 'cgu.md',
  privacy: 'politique-de-confidentialite.md',
  mentions: 'mentions-legales.md',
  charte: 'charte-communaute.md',
};

/** `./cgu.md` → `/cgu`, so the markdown cross-links resolve inside the app. */
const MD_TO_ROUTE = {
  'cgu.md': LEGAL_ROUTES.cgu,
  'politique-de-confidentialite.md': LEGAL_ROUTES.privacy,
  'mentions-legales.md': LEGAL_ROUTES.mentions,
  'charte-communaute.md': LEGAL_ROUTES.charte,
};

const LEGAL_DIR = path.join(__dirname, '..', '..', '..', 'legal');

// The documents ship before the team has filled every `[PLACEHOLDER]`; the banner + the highlighted
// tokens are the "à valider" signalling the delivery note asks for (legal/README.md § 1).
const DRAFT_NOTICE =
  '<p class="ep-legal-draft">Version de travail — texte en cours de validation juridique. ' +
  'Les mentions entre crochets restent à compléter avant la mise en ligne définitive.</p>';

/** Renders one markdown source to the trusted HTML stored in `LegalDocument.content`. */
function renderLegalMarkdown(markdown) {
  const html = marked.parse(
    markdown.replace(/\[VERSION_(?:CGU|CHARTE|POLITIQUE)\]/g, LEGAL_VERSION),
    { async: false },
  );

  return (
    DRAFT_NOTICE +
    html
      // Known cross-document links → app routes.
      .replace(/href="\.\/([^"]+\.md)"/g, (whole, file) =>
        MD_TO_ROUTE[file] ? `href="${MD_TO_ROUTE[file]}"` : whole,
      )
      // Anything still pointing at a .md file is a document that does not exist yet (the cookie
      // policy): drop the dead anchor, keep its label.
      .replace(/<a href="[^"]*\.md">([^<]*)<\/a>/g, '$1')
      // Surface the unfilled placeholders instead of letting them read as finished copy.
      .replace(/\[([A-Z][A-Z0-9_]{2,})\]/g, '<mark class="ep-legal-todo">[$1]</mark>')
      // Wide registers (the privacy processing table) scroll inside their own box instead of
      // pushing the whole page into horizontal overflow on mobile.
      .replace(/<table>/g, '<div class="ep-legal-table"><table>')
      .replace(/<\/table>/g, '</table></div>')
  );
}

/** Reads `legal/*.md` and returns one `LegalDocument` payload per kind. */
function loadLegalDocuments() {
  return Object.entries(LEGAL_SOURCES).map(([kind, file]) => ({
    kind,
    version: LEGAL_VERSION,
    content: renderLegalMarkdown(fs.readFileSync(path.join(LEGAL_DIR, file), 'utf8')),
  }));
}

module.exports = { LEGAL_VERSION, LEGAL_ROUTES, loadLegalDocuments, renderLegalMarkdown };
