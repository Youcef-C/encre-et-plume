// MC-4 — "Appels à projets" board. Shared FE/BE contract for the full board
// (GET /calls with filters), POST /calls, and owner close-early (PATCH /calls/:id).
// Extends the MC-1 preview: CallCard is a strict superset of CallPreview, so the
// /trouver CallsPreview band keeps reading `.items` unchanged.
import type { CreatorRole } from './onboarding.js';
import type { CallPreview } from './partners.js';

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

/** Board card — strict superset of the MC-1 CallPreview (CallsPreview keeps working). */
export interface CallCard extends CallPreview {
  direction: CallDirection;
  description: string;
  sampleUrl: string | null; // Media thumb variant URL, null → dashed sample-slot placeholder
  status: CallStatus; // derived server-side (deadline passed ⇒ closed)
  deadline: string | null; // ISO; drives "Clôture dans X j" (closesInDays stays precomputed)
  isOwner: boolean; // viewer owns this call ⇒ no "Candidater"
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
  direction: CallDirection;
  title: string;
  description: string;
  genres: string[]; // GENRES ids, 1–5
  format?: CallFormat;
  scope?: string; // e.g. "~120 planches"
  sampleMediaId?: string; // F-10 Media id, kind 'call_sample', owned + ready
  deadline: string; // ISO date, must be future
}

export interface CloseCallRequest {
  status: 'closed';
}

/** Payload for the `calls` queue `close-call` delayed job (auto-close at deadline). */
export interface CloseCallJob {
  callId: string;
}
