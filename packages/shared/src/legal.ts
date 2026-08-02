// F-13: legal documents & consent contracts (FE/BE agree here).

/**
 * Public legal document kinds. `mentions` has no consent, only content.
 * `charte` (Charte de la communauté) is an integral part of the CGU (CGU art. 2 & 3) — it is served
 * and linked like the others, but accepting the CGU accepts it too, so it is NOT a ConsentDocument.
 */
export type LegalKind = 'cgu' | 'privacy' | 'mentions' | 'charte';
export const LEGAL_KINDS: readonly LegalKind[] = ['cgu', 'privacy', 'mentions', 'charte'] as const;

/** Subset of documents a user actively consents to. */
export type ConsentDocument = 'cgu' | 'privacy';
export const CONSENT_DOCUMENTS: readonly ConsentDocument[] = ['cgu', 'privacy'] as const;

/** GET /legal/:kind response — the current published document. */
export interface LegalDocumentDto {
  kind: LegalKind;
  version: string;
  content: string;     // trusted HTML (team/seed-provided)
  publishedAt: string; // ISO 8601
}

/** POST /consents body (authenticated). */
export interface ConsentDto {
  document: ConsentDocument;
  version: string;
}

/** POST /consents success body. */
export interface ConsentResponse {
  recorded: true;
}

/** Machine-readable error code when a consent version is not a published one. */
export const LEGAL_VERSION_UNKNOWN = 'LEGAL_VERSION_UNKNOWN';
