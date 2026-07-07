// MC-5 "Candidater" — apply to an open call. Shared FE/BE contract for
// POST /calls/{callId}/applications. The ApplicationDto is also the row shape
// MC-6 ("Mes candidatures") and MC-7 ("Candidatures reçues") will list next.
import type { InvitationUserRef } from './invitations.js';
import type { CallDirection } from './calls.js';
import type { CreatorRole } from './onboarding.js';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export const APPLICATION_MESSAGE_MAX = 1000;

/**
 * POST /calls/{callId}/applications body. Exactly ONE of the two sample fields
 * (the story's `sampleAssetId` — no Asset model, MC-4 ⚑5): a freshly uploaded
 * F-10 Media, or a selected F-3 portfolio piece.
 */
export interface ApplyToCallRequest {
  sampleMediaId?: string; // F-10 Media id, kind 'application_sample' — the "upload a file" path
  samplePortfolioItemId?: string; // F-3 PortfolioItem id — the "select a portfolio piece" path
  message?: string; // optional, ≤ APPLICATION_MESSAGE_MAX
  appliedAs?: CreatorRole; // MC-6: which of the applicant's creator roles they apply as (dual-role users). Absent → server default (see backend-notes). 400 if not one of the applicant's roles.
}

/** 201 response — and the row shape MC-6 / MC-7 will list. */
export interface ApplicationDto {
  id: string;
  callId: string;
  applicant: InvitationUserRef; // reuse MC-3's ref — MC-7 renders the applicant
  sampleUrl: string; // resolved display URL (Media thumb variant or PortfolioItem.image)
  message: string; // '' when omitted
  status: ApplicationStatus; // 'pending' at creation
  appliedAs: CreatorRole | null; // MC-6: the role the applicant applied as; null = unspecified
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
  createdAt: string; // ISO — "Candidaté le …"
}

export interface MyApplicationsResponse {
  items: MyApplicationRow[];
  page: number;
  pageSize: number; // MY_APPLICATIONS_PAGE_SIZE
  total: number; // count for the ACTIVE status filter (drives pagination)
  totalAll: number; // unfiltered count — the "Toutes · N" chip
}
