// MC-9: floating messaging widget — shared contracts (FE + BE agree here).
// Types + consts only (shared builds to CJS). WS event names live here so both sides use one source.

export type ConversationType = 'dm' | 'group' | 'salon';

export interface ConversationParticipantDto {
  userId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
}

export interface LastMessagePreview {
  body: string; // message body, or the attachment name when body is empty
  senderName: string;
  createdAt: string; // ISO
}

/** DM request lifecycle (MC-9 delta). 'declined' exists only in the DB — never serialized to clients. */
export type ConversationStatus = 'open' | 'requested';

export interface ConversationItem {
  id: string;
  type: ConversationType;
  name: string; // group name, or the OTHER party's displayName for a DM
  projectId: string | null; // CS-8 seam
  participants: ConversationParticipantDto[];
  unreadCount: number;
  lastMessage: LastMessagePreview | null;
  lastMessageAt: string; // ISO — list ordering key
  status: ConversationStatus; // groups/salon always 'open'; DM requests may be 'requested'
  requestedBy: string | null; // accountId of the requester while status === 'requested', else null
  createdBy: string | null; // MC-12: group owner accountId; null for dm/salon
}

/** MC-12: POST /conversations/:id/participants body. */
export interface AddParticipantRequest {
  accountId: string;
}

export interface ConversationsResponse {
  items: ConversationItem[];
  nextCursor: string | null;
  totalUnread: number; // launcher badge — summed across the user's OPEN conversations
  requestsCount: number; // pending incoming DM requests — backs the "Demandes" tab badge
}

export type ConversationRequestAction = 'accept' | 'decline';
export interface RespondConversationRequestRequest {
  action: ConversationRequestAction;
}

export interface MessageAttachment {
  mediaId: string;
  name: string;
  kind: 'image' | 'document';
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachments: MessageAttachment[];
  createdAt: string; // ISO
  readBy: string[]; // participant ids (derived from lastReadAt), sender excluded
}

export interface MessagesPage {
  items: MessageDto[]; // newest-first
  nextCursor: string | null;
}

export interface SendMessageRequest {
  body?: string;
  attachments?: { mediaId: string }[];
}

export type CreateConversationRequest =
  | { participantId: string } // DM (get-or-create)
  | { name: string; participantIds: string[] }; // group

export interface MarkReadResponse {
  unreadCount: 0;
}

// ── WS events — single source of truth for both sides ────────────────────────
export const WS_EVENTS = {
  messageNew: 'message:new',
  conversationRead: 'conversation:read',
  typing: 'typing',
  // BE-RT1: lightweight "refetch your unread counts now" nudge, pushed to the recipient's user room
  // whenever ANY F-5 notification is created (chat, connection requests, applications, invitations…).
  // Payload-less — GET /notifications/unread-counts stays the count source of truth.
  unreadChanged: 'unread:changed',
  // MC-11 salon: new message broadcast to all connected clients + live presence count.
  salonMessage: 'salon:message',
  salonPresence: 'salon:presence',
  // MC-13 Comptoir roster = salon MEMBERSHIP (joined via "Rejoindre le salon" until "Quitter"), NOT
  // WS/app-online. Server broadcasts these to the salon room on join/leave so open viewers refresh live.
  salonMemberJoined: 'salon:member:joined', // server → salon room, { user: ReachableUser }
  salonMemberLeft: 'salon:member:left', // server → salon room, { userId }
  // MC-9 delta: a DM request was accepted/declined → both participants refetch their lists.
  conversationUpdated: 'conversation:updated',
  // MC-12: group membership changes fan out to every (former) participant's user room.
  participantAdded: 'participant:added',
  participantRemoved: 'participant:removed',
  conversationDeleted: 'conversation:deleted',
} as const;

export interface WsConversationUpdated {
  conversationId: string;
}

// MC-13 Comptoir membership realtime payloads (broadcast to the salon room on join/leave).
export interface WsSalonMemberJoined {
  user: import('./salon.js').ReachableUser;
}
export interface WsSalonMemberLeft {
  userId: string;
}

// MC-12 group-management realtime payloads.
export interface WsParticipantAdded {
  conversationId: string;
  participant: ConversationParticipantDto;
}
export interface WsParticipantRemoved {
  conversationId: string;
  userId: string; // the removed/leaving member
  createdBy: string | null; // post-change owner (reflects an owner-leave transfer)
}
export interface WsConversationDeleted {
  conversationId: string;
}

export interface WsMessageNew {
  conversationId: string;
  message: MessageDto;
  conversationName: string;
  senderName: string;
}
export interface WsConversationRead {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}
export interface WsTypingClient {
  conversationId: string;
  isTyping: boolean;
}
export interface WsTypingServer {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

// MC-11 salon realtime payloads.
export interface WsSalonMessage {
  message: import('./salon.js').SalonMessageDto;
}
export interface WsSalonPresence {
  onlineCount: number;
}

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_MAX_ATTACHMENTS = 5;
export const GROUP_NAME_MAX_LENGTH = 80;
export const SEND_RATE_LIMIT = { max: 30, windowSec: 60 } as const;

// Default page sizes (paginate every list).
export const CONVERSATIONS_PAGE_SIZE = 50;
export const CONVERSATIONS_PAGE_MAX = 100;
export const MESSAGES_PAGE_SIZE = 30;
export const MESSAGES_PAGE_MAX = 100;
