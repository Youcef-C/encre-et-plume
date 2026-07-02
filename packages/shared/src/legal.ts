// F-13: legal documents & consent contracts (FE/BE agree here).

/** Public legal document kinds. `mentions` has no consent, only content. */
export type LegalKind = 'cgu' | 'privacy' | 'mentions';
export const LEGAL_KINDS: readonly LegalKind[] = ['cgu', 'privacy', 'mentions'] as const;

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
