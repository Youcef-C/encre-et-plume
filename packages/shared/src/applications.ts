// MC-5 "Candidater" — apply to an open call. Shared FE/BE contract for
// POST /calls/{callId}/applications. The ApplicationDto is also the row shape
// MC-6 ("Mes candidatures") and MC-7 ("Candidatures reçues") will list next.
import type { InvitationUserRef } from './invitations.js';
import type { CallDirection } from './calls.js';
import type { CreatorRole } from './onboarding.js';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export const APPLICATION_MESSAGE_MAX = 1000;
export const APPLICATION_MAX_SAMPLES = 3; // MC-4X: up to 3 mixed samples per application

/** MC-4X: one sample ref in an application (XOR) — a freshly uploaded F-10 Media, or a portfolio piece. */
export interface ApplicationSampleRef {
  mediaId?: string; // F-10 Media id — kind 'application_sample' (image) or 'application_document' (PDF)
  portfolioItemId?: string; // F-3 PortfolioItem id — the "select a portfolio piece" path
}

/** MC-4X: a resolved sample for display on ApplicationDto / MyApplicationRow. */
export interface ApplicationSample {
  url: string; // image thumb / portfolio image, or document CDN url
  kind: 'image' | 'document'; // FE renders a thumbnail vs a PDF download link
  size: number | null; // bytes — documents only
}

/**
 * POST /calls/{callId}/applications body. MC-4X: 1..APPLICATION_MAX_SAMPLES mixed samples
 * (uploaded image, uploaded PDF, or a portfolio piece); `appliedAs` is now server-derived
 * (= the call's seekingRole, which the applicant provably holds) and no longer accepted.
 */
export interface ApplyToCallRequest {
  samples: ApplicationSampleRef[]; // 1..APPLICATION_MAX_SAMPLES
  message?: string; // optional, ≤ APPLICATION_MESSAGE_MAX
  // MC-4X req6: only needed when the call seeks MULTIPLE roles AND the applicant holds >1 of them —
  // the FE shows a chooser restricted to that intersection. Otherwise omit; the server derives it.
  // 400 if provided but not in (seekingRoles ∩ applicant creatorRoles).
  appliedAs?: CreatorRole;
}

/** 201 response — and the row shape MC-6 / MC-7 will list. */
export interface ApplicationDto {
  id: string;
  callId: string;
  applicant: InvitationUserRef; // reuse MC-3's ref — MC-7 renders the applicant
  sampleUrl: string; // resolved display URL of the FIRST sample (row thumbnail)
  samples: ApplicationSample[]; // MC-4X: all samples, position order
  message: string; // '' when omitted
  status: ApplicationStatus; // 'pending' at creation
  appliedAs: CreatorRole | null; // the role the applicant applied as (server-derived = call seekingRole); null on historical rows
  createdAt: string; // ISO
}

// ── MC-6 "Mes candidatures" — the current user's own submitted applications ────

export const MY_APPLICATIONS_PAGE_SIZE = 20;

export type MyApplicationsStatusFilter = ApplicationStatus | 'all'; // default 'all'

export interface MyApplicationsQuery {
  status?: MyApplicationsStatusFilter;
  page?: number; // 1-based
}

/** Row for MC-6 "Mes candidatures" — Application joined to its ProjectCall. */
export interface MyApplicationRow {
  id: string;
  callId: string;
  callTitle: string; // ProjectCall.title
  callDirection: CallDirection; // derived from authorRole/seekingRole (same mapping the board uses)
  callGenres: string[]; // ProjectCall.genres (GENRES ids) — FE renders the first label
  callSampleUrl: string | null; // the CALL's cover thumb (same resolution as CallCard.sampleUrl); null → placeholder
  ownerName: string; // ProjectCall.authorName (denormalized — works for authorId:null seed calls)
  status: ApplicationStatus;
  appliedAs: CreatorRole | null; // MC-6: the role the applicant applied as; null = unspecified (FE falls back to creatorRoles[0])
  samples: ApplicationSample[]; // MC-4X: the applicant's own submitted samples, position order (first feeds the thumbnail)
  createdAt: string; // ISO — "Candidaté le …"
}

export interface MyApplicationsResponse {
  items: MyApplicationRow[];
  page: number;
  pageSize: number; // MY_APPLICATIONS_PAGE_SIZE
  total: number; // count for the ACTIVE status filter (drives pagination)
  totalAll: number; // unfiltered count — the "Toutes · N" chip
}
