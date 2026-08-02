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
  name: string; // display title: group name (or, unnamed, its members' names), OTHER party for a DM
  /**
   * The group's OWN stored name, `null` when it has none (the title above is then derived from the
   * participants). Only "who may rename" cares about the difference — it seeds the rename field so an
   * unnamed group doesn't pre-fill with a title nobody typed. Absent for dm/salon.
   */
  customName?: string | null;
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

/**
 * MC-15 — the message a reply quotes, resolved server-side so no client re-derives it.
 * `deleted: true` means the quoted message is gone (D-3): the quote still renders, as
 * « Message supprimé », instead of the reply silently losing its context.
 */
export interface MessageReplyRef {
  id: string;
  senderId: string;
  senderName: string;
  excerpt: string; // truncated server-side to MESSAGE_EXCERPT_MAX; '' when deleted
  deleted: boolean;
}

/** MC-15 — the action fields every message surface shows (widget, salon dock, project Discussion). */
export interface MessageActionFields {
  replyTo: MessageReplyRef | null;
  editedAt: string | null; // ISO; non-null ⇒ show « modifié »
  likeCount: number;
  likedByMe: boolean;
}

export interface MessageDto extends MessageActionFields {
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
  /** MC-15: quote a message of the SAME conversation (400 otherwise). */
  replyToId?: string;
}

/** MC-15 — PATCH /messages/:id. Author-only; refused (403) on a salon message. */
export interface EditMessageRequest {
  text: string;
}

/**
 * MC-15 R2-B — one person who liked a message, from `GET /messages/:id/likes`.
 *
 * Deliberately NOT a field on `MessageDto` / `SalonMessageDto`: a thread page would then carry the
 * likers of every message, which almost nobody opens, and the read path would lose its
 * 2-queries-per-page property. This is fetched on demand, when the list is opened.
 */
export interface MessageLikerDto {
  accountId: string;
  displayName: string;
  avatar: string | null;
  createdAt: string; // ISO — when they liked
}

/** GET /messages/:id/likes — paginated, participant-gated, MC-10-blocked accounts excluded. */
export interface MessageLikesPage {
  items: MessageLikerDto[]; // newest like first
  nextCursor: string | null; // the last accountId of a full page
}

// ── CS-8: the project's Discussion tab ───────────────────────────────────────
// A project chat IS a `Conversation { type:'group', projectId }` — there is NO parallel project
// Message entity. These two shapes are the project-scoped façade over the MC-9 routes.

/** GET /projects/{slug}/messages — the project thread's page, plus the conversation it belongs to
 *  (the panel needs the id to match realtime `message:new` events). */
export interface ProjectChatPage extends MessagesPage {
  conversationId: string;
  /** The viewer may post — i.e. is a project member. Read-only viewers never see the composer. */
  canPost: boolean;
}

/** POST /projects/{slug}/messages */
export interface SendProjectMessageRequest {
  text?: string;
  attachments?: { mediaId: string }[];
  /** MC-15: quote a message of the SAME project thread (400 otherwise). */
  replyToId?: string;
}

export type CreateConversationRequest =
  | { participantId: string } // DM (get-or-create)
  | { name?: string; participantIds: string[] }; // group — the name is OPTIONAL, settable later

/** PATCH /conversations/:id — set (or clear, with '') a group's name. Creator-only, server-enforced. */
export interface RenameConversationRequest {
  name: string;
}

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
  // MC-15 message actions — patched in place by every open surface, no refetch. Sent to the
  // conversation's participants (user rooms), or to the salon room for a salon message.
  messageEdited: 'message:edited',
  messageDeleted: 'message:deleted',
  messageLiked: 'message:liked',
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

// MC-15 message-action payloads — the changed field only, never the whole thread.
export interface WsMessageEdited {
  conversationId: string;
  messageId: string;
  body: string;
  editedAt: string; // ISO
}
export interface WsMessageDeleted {
  conversationId: string;
  messageId: string;
}
export interface WsMessageLiked {
  conversationId: string;
  messageId: string;
  userId: string; // who (un)liked — the receiver flips likedByMe only for itself
  liked: boolean;
  likeCount: number;
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
/** MC-15: how much of a quoted message the server puts in `MessageReplyRef.excerpt`. */
export const MESSAGE_EXCERPT_MAX = 120;
export const MESSAGE_MAX_ATTACHMENTS = 5;
export const GROUP_NAME_MAX_LENGTH = 80;
export const SEND_RATE_LIMIT = { max: 30, windowSec: 60 } as const;

// Default page sizes (paginate every list).
export const CONVERSATIONS_PAGE_SIZE = 50;
export const CONVERSATIONS_PAGE_MAX = 100;
export const MESSAGES_PAGE_SIZE = 30;
export const MESSAGES_PAGE_MAX = 100;
/** MC-15 R2-B: the likers list is paginated like every other list. */
export const MESSAGE_LIKES_PAGE_SIZE = 30;
export const MESSAGE_LIKES_PAGE_MAX = 100;
