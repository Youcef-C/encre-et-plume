// MC-11: community salon "Le Comptoir" (dock widget) — shared contracts (FE + BE agree here).
// One global public room reusing the MC-9 Conversation/Message backend. Types + consts only.

export interface SalonSummary {
  conversationId: string;
  name: string; // "Le Comptoir"
  onlineCount: number; // distinct connected users in the salon socket room
  unreadCount: number; // members: messages after my lastReadAt not sent by me; non-members: 0
  isMember: boolean;
}

export interface SalonMessageDto {
  id: string;
  senderId: string; // drives client-side MC-10 filtering
  senderName: string; // shown above each bubble
  body: string;
  createdAt: string; // ISO
}

export interface SalonMessagesPage {
  items: SalonMessageDto[]; // newest-first
  nextCursor: string | null;
}

export interface SalonSendRequest {
  body: string;
}

export interface SalonMembershipResponse {
  isMember: boolean;
}

export interface SalonOnlineUser {
  userId: string;
  name: string;
}

export interface SalonOnlineResponse {
  items: SalonOnlineUser[];
}

export const SALON_NAME = 'Le Comptoir';
export const SALON_SEND_RATE_LIMIT = { max: 10, windowSec: 30 } as const; // flood control (inferred)
export const SALON_MESSAGES_PAGE_SIZE = 30;
export const SALON_MESSAGES_PAGE_MAX = 100;
export const SALON_ONLINE_LIST_MAX = 50;

// ── MC-13: Comptoir room-presence roster + reachable-user search ──────────────

// One user shape shared by the Comptoir roster (GET /salon/presence) and the
// reachable-user search (GET /accounts/search). Distinct from SalonOnlineUser
// (MC-11 app-online) — this is "joined the salon" / "reachable to DM".
export interface ReachableUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  slug: string;
  /**
   * Contacts-DM follow-up (2026-07-26): true when the user is one of the caller's MC-8 contacts.
   * Set by GET /accounts/search (contacts rank first, and an EMPTY q lists the contacts) so the
   * pickers can surface "Vos contacts" after the Contacts dropdown was retired. Absent on the salon
   * roster payloads, which don't compute connections.
   */
  isContact?: boolean;
}

// A roster row = a ReachableUser plus a `self` flag. The caller's own row is included and flagged so
// the FE renders it as "· vous" with no actions. (search keeps the plain ReachableUser — no self.)
export interface SalonRosterItem extends ReachableUser {
  self: boolean;
}

export interface SalonPresenceResponse {
  count: number; // === items.length — ALL salon members the viewer can see (self INCLUDED, only blocked excluded)
  items: SalonRosterItem[]; // the "N en ligne dans Le Comptoir" list; caller alone → [<self>], count 1
}

export const SALON_ROSTER_MAX = 100; // ponytail: cap applied to BOTH count + roster identically; paginate when a salon exceeds this

// MC-13: reachable-user search response (reuses ReachableUser). Lives here beside
// ReachableUser (ponytail: no new shared file for one interface + one const).
export interface AccountSearchResponse {
  items: ReachableUser[];
}

export const ACCOUNT_SEARCH_MAX = 20;
