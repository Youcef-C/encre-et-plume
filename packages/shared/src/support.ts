// F-21: Support & contact — shared contracts.

export const SUPPORT_CATEGORIES = ['general', 'account', 'bug', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** French labels, verbatim from the story — the FE renders these in OnBrandSelect. */
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  general: 'Question générale',
  account: 'Problème de compte',
  bug: 'Signaler un bug',
  other: 'Autre',
};

/** Technical context auto-captured in "Signaler un bug" mode (each field user-removable). */
export interface SupportTicketContext {
  url?: string;
  userAgent?: string;
  /** F-9 correlation id from the last API response's x-request-id header. */
  requestId?: string;
}

export interface CreateSupportTicketRequest {
  category: SupportCategory;
  name: string;
  email: string;
  message: string;
  context?: SupportTicketContext;
  /** Honeypot — real users never fill it; bots do. Omit or empty. */
  website?: string;
}

export interface CreateSupportTicketResponse {
  ok: true;
}
