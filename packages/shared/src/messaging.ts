// MC-9: floating messaging widget — shared contracts (FE + BE agree here).
// Types + consts only (shared builds to CJS). WS event names live here so both sides use one source.

export type ConversationType = 'dm' | 'group';

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

export interface ConversationItem {
  id: string;
  type: ConversationType;
  name: string; // group name, or the OTHER party's displayName for a DM
  projectId: string | null; // CS-8 seam
  participants: ConversationParticipantDto[];
  unreadCount: number;
  lastMessage: LastMessagePreview | null;
  lastMessageAt: string; // ISO — list ordering key
}

export interface ConversationsResponse {
  items: ConversationItem[];
  nextCursor: string | null;
  totalUnread: number; // launcher badge — summed across ALL the user's conversations
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
} as const;

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

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGE_MAX_ATTACHMENTS = 5;
export const GROUP_NAME_MAX_LENGTH = 80;
export const SEND_RATE_LIMIT = { max: 30, windowSec: 60 } as const;

// Default page sizes (paginate every list).
export const CONVERSATIONS_PAGE_SIZE = 50;
export const CONVERSATIONS_PAGE_MAX = 100;
export const MESSAGES_PAGE_SIZE = 30;
export const MESSAGES_PAGE_MAX = 100;
