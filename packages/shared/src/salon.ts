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
