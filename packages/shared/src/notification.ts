// Shared notification contracts for F-5 (notifications & unread badges).

export type NotifType =
  | 'message'
  | 'application'
  | 'report'
  | 'invitation'
  | 'project_activity'
  | 'release'
  | 'like'
  | 'comment'
  | 'system'; // F-14: system notifications (data export ready, etc.)

export type NotifArea = 'messages' | 'demandes' | 'signalements' | 'autres';

export interface NotificationSource {
  displayName: string;
  /** Account.profileSlug */
  slug: string;
  avatar: string | null;
}

/** GET /notifications item. */
export interface NotificationItem {
  id: string;
  type: NotifType;
  /** Server-derived from type via AREA_BY_TYPE map. */
  area: NotifArea;
  refId: string | null;
  sourceUser: NotificationSource | null;
  /** ISO 8601 string. */
  createdAt: string;
  /** null = unread. ISO 8601 string when read. */
  readAt: string | null;
}

/** GET /notifications/unread-counts. signalements is 0 unless requester is admin/maintainer. */
export interface UnreadCounts {
  total: number;
  messages: number;
  demandes: number;
  signalements: number;
}

/** POST /notifications/read-all response. */
export interface MarkAllReadResponse {
  updated: number;
}
