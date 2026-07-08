// MC-4 — "Appels à projets" board. Shared FE/BE contract for the full board
// (GET /calls with filters), POST /calls, and owner close-early (PATCH /calls/:id).
// Extends the MC-1 preview: CallCard is a strict superset of CallPreview, so the
// /trouver CallsPreview band keeps reading `.items` unchanged.
import type { CreatorRole } from './onboarding.js';
import type { CallPreview } from './partners.js';
import type { InvitationUserRef } from './invitations.js';

export const CALL_DIRECTIONS = ['writerSeeksIllustrator', 'illustratorSeeksWriter'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_FORMATS = ['serie', 'one_shot'] as const;
export type CallFormat = (typeof CALL_FORMATS)[number];

export type CallStatus = 'open' | 'closed';

/** FR chip label for a format value (prototype: "One-shot", "Série"). */
export const CALL_FORMAT_LABELS: Record<CallFormat, string> = {
  serie: 'Série',
  one_shot: 'One-shot',
};

export const CALLS_BOARD_PAGE_SIZE = 10;

// MC-4X: per-call asset caps (samples + PDF documents), enforced in the create service.
export const CALL_MAX_SAMPLES = 5;
export const CALL_MAX_DOCUMENTS = 3;
// MC-4X §8: max seats a call may request per sought role.
export const CALL_MAX_SEATS_PER_ROLE = 5;

/** MC-4X §8: seat counts per sought role, e.g. { dessinateur: 2, scenariste: 1 }. */
export type SeatCounts = Partial<Record<CreatorRole, number>>;

/** Board card — strict superset of the MC-1 CallPreview (CallsPreview keeps working). */
export interface CallCard extends CallPreview {
  direction: CallDirection; // derived from authorRoles[0] (writer vs illustrator) — MC-6 mapping
  seekingRoles: CreatorRole[]; // MC-4X req6: the role(s) this call seeks (1..2, = seats keys). Drives the gate hint + heading
  seats: SeatCounts; // MC-4X §8: how many of each role the author seeks
  acceptedByRole: SeatCounts; // MC-4X §8: accepted applications grouped by appliedAs (seats filled)
  remainingSeats: number; // MC-4X §8: total sought − total accepted (floored at 0); 0 ⇒ all seats filled
  description: string;
  sampleUrl: string | null; // first sample thumb variant URL, null → dashed sample-slot placeholder
  status: CallStatus; // derived server-side (deadline passed OR all seats filled ⇒ closed)
  deadline: string | null; // ISO; drives "Clôture dans X j" (closesInDays stays precomputed)
  isOwner: boolean; // viewer owns this call ⇒ no "Candidater"
  hasApplied: boolean; // MC-5: viewer already applied ⇒ disabled "Candidature envoyée" (== myApplicationId !== null)
  myApplicationId: string | null; // MC-6: the viewer's own Application id on this call, for withdraw (DELETE /me/applications/:id); null if not applied
  viewerHasRole: boolean; // MC-4X: viewer's creatorRoles contain this call's seekingRole → the FE gate can't drift from the server rule
}

export interface CallsBoardQuery {
  role?: CreatorRole; // direction sought (matches seekingRole)
  genre?: string[]; // GENRES ids
  status?: CallStatus | 'all'; // default 'open' (preserves MC-1 preview behavior)
  page?: number; // 1-based, pageSize CALLS_BOARD_PAGE_SIZE
}

export interface CallsBoardResponse {
  items: CallCard[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateCallRequest {
  // MC-4X §8: authorRole/seekingRoles are NO LONGER sent. The author position is derived server-side
  // from profile.creatorRoles; the sought roles are the keys of `seats`.
  seats: SeatCounts; // MC-4X §8: ≥1 seat total, 1..CALL_MAX_SEATS_PER_ROLE per role (keys = sought roles)
  title: string;
  description: string;
  genres: string[]; // GENRES ids, 1–5
  format?: CallFormat;
  scope?: string; // e.g. "~120 planches"
  sampleMediaIds?: string[]; // MC-4X: F-10 Media ids, kind 'call_sample', owned + ready, max CALL_MAX_SAMPLES (replaces sampleMediaId)
  documentMediaIds?: string[]; // MC-4X: F-10 Media ids, kind 'call_document' (PDF), owned + ready, max CALL_MAX_DOCUMENTS
  projectId?: string; // MC-4X req6: optional link to one of the author's own Projects (GET /projects/mine)
  deadline: string; // ISO date, must be future
}

/** MC-4X: a PDF scenario attachment shown in the call detail view. */
export interface CallDocument {
  mediaId: string;
  url: string; // public CDN URL (variants.orig)
  size: number; // bytes — FE renders "PDF · x,y Mo"
}

/** MC-4X: full call detail (GET /calls/:id) — CallCard + all samples/documents + createdAt + team. */
export interface CallDetail extends CallCard {
  createdAt: string; // ISO — "Publié le …"
  samples: string[]; // web-variant URLs of ALL ready call_sample assets, position order
  documents: CallDocument[]; // ready call_document assets, position order
  team: InvitationUserRef[]; // MC-4X req6: author + linked-project accepted collaborators + accepted applicants of this call
}

export interface CloseCallRequest {
  status: 'closed';
}

/** Payload for the `calls` queue `close-call` delayed job (auto-close at deadline). */
export interface CloseCallJob {
  callId: string;
}
