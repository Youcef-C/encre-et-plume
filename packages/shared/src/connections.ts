// MC-8 — "Contacts & connexions". Shared FE/BE contract for the connections network:
// contacts list, incoming requests, suggestions (MC-2), scoped people search (F-7), presence.
import type { CreatorRole } from './onboarding.js';
import type { MatchSuggestion } from './matches.js';

/** D4: a session whose newest lastSeen is within this window counts as "en ligne". */
export const PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

/** People-search CTA state between the viewer and a result (D12). */
export type ConnectionState = 'none' | 'pending_out' | 'pending_in' | 'connected';

export interface PresenceInfo {
  online: boolean;
  /** ISO 8601 of the newest session activity, or null when never seen. */
  lastSeen: string | null;
}

/** GET /contacts item — one accepted connection, mapped to the OTHER party. */
export interface ContactItem {
  userId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  role: CreatorRole | null;
  city: string | null;
  mutualProjects: number;
  presence: PresenceInfo;
}
export interface ContactsResponse {
  items: ContactItem[];
}

/** Direction for GET /connections/requests: 'incoming' (received, default) or 'outgoing' (sent). */
export type ConnectionRequestDirection = 'incoming' | 'outgoing';

/**
 * GET /connections/requests item — one pending request. For `incoming`, `from` is the requester;
 * for `outgoing`, `from` carries the addressee (the person you sent the request to).
 */
export interface ConnectionRequestItem {
  id: string;
  from: {
    userId: string;
    slug: string;
    name: string;
    avatarUrl: string | null;
    role: CreatorRole | null;
  };
  /** Server-derived French context line, frozen at creation (D6). */
  context: string;
  createdAt: string;
}
export interface ConnectionRequestsResponse {
  items: ConnectionRequestItem[];
}

/** POST /connections/requests body. */
export interface CreateConnectionRequestBody {
  toUser: string;
}
/** PATCH /connections/requests/:id body. */
export interface DecideConnectionRequestBody {
  status: 'accepted' | 'declined';
}
/** POST/PATCH response — minimal echo of the affected row. */
export interface ConnectionRequestDto {
  id: string;
  status: ConnectionStatus;
}

/** GET /connections/suggestions — MC-2 delegated. `incompleteProfile` drives the FE empty state. */
export interface ConnectionSuggestionsResponse {
  items: MatchSuggestion[];
  incompleteProfile: boolean;
}

/** GET /people/search item (F-7 scoped search). */
export interface PeopleSearchItem {
  userId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  role: CreatorRole | null;
  location: string | null;
  connectionState: ConnectionState;
}
export interface PeopleSearchResponse {
  items: PeopleSearchItem[];
}

/** GET /presence?userIds= — batch presence. */
export interface PresenceResponse {
  items: Array<{ userId: string } & PresenceInfo>;
}
