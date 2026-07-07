// MC-5 "Candidater" — apply to an open call. Shared FE/BE contract for
// POST /calls/{callId}/applications. The ApplicationDto is also the row shape
// MC-6 ("Mes candidatures") and MC-7 ("Candidatures reçues") will list next.
import type { InvitationUserRef } from './invitations.js';

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
}

/** 201 response — and the row shape MC-6 / MC-7 will list. */
export interface ApplicationDto {
  id: string;
  callId: string;
  applicant: InvitationUserRef; // reuse MC-3's ref — MC-7 renders the applicant
  sampleUrl: string; // resolved display URL (Media thumb variant or PortfolioItem.image)
  message: string; // '' when omitted
  status: ApplicationStatus; // 'pending' at creation
  createdAt: string; // ISO
}
