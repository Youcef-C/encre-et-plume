// MC-3 "Proposer une collab" — collaboration invitation contracts (FE + BE agree here).
import type { CreatorRole } from './onboarding.js';
import type { ProjectSummary } from './projects.js';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export const INVITATION_MESSAGE_MAX = 1000;
export const INVITATIONS_PAGE_SIZE = 20;
export const INVITATIONS_MAX_PAGE_SIZE = 50;

export interface CreateInvitationRequest {
  toUser: string; // recipient Account id
  projectId?: string; // optional; must belong to the sender
  message?: string; // ≤ INVITATION_MESSAGE_MAX; default ''
}

export interface InvitationUserRef {
  userId: string;
  name: string;
  slug: string; // /{slug} profile link
  avatarUrl: string | null;
  role: CreatorRole | null; // creatorRoles[0] ?? null
}

export interface InvitationDto {
  id: string;
  from: InvitationUserRef;
  to: InvitationUserRef;
  project: ProjectSummary | null;
  message: string;
  status: InvitationStatus;
  createdAt: string; // ISO
  respondedAt: string | null;
}

export interface InvitationsResponse {
  items: InvitationDto[];
  page: number;
  pageSize: number;
  total: number;
}

export type InvitationDirection = 'sent' | 'received';

export interface RespondInvitationRequest {
  status: Exclude<InvitationStatus, 'pending'>; // 'accepted' | 'declined'
}
