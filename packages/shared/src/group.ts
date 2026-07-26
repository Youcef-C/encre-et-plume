// CS-10 — co-author permissions & revenue split ("Gérer le groupe") contracts (FE + BE agree here).
// The group model lives on the EXISTING membership row (`WorkCreator`): `groupRole`, `permissions`,
// `sharePct`. No parallel Member model. The permission seam (hasGroupPermission / isGroupLeader /
// getGroupLeaders) is consumed by CS-4 (écriture), CS-5 (corrections) and later CS-6/CS-7/CS-9/CS-16.

export const GROUP_ROLES = ['leader', 'coleader', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];
export const GROUP_ROLE_LABELS: Record<GroupRole, string> = {
  leader: 'Chef·fe de groupe',
  coleader: 'Co-chef·fe',
  member: 'Membre',
};

export const GROUP_PERMISSIONS = ['ecriture', 'corrections', 'fusion'] as const;
export type GroupPermission = (typeof GROUP_PERMISSIONS)[number];
export const GROUP_PERMISSION_LABELS: Record<GroupPermission, string> = {
  ecriture: 'Écriture',
  corrections: 'Corrections',
  fusion: 'Fusion',
};
export const DEFAULT_MEMBER_PERMISSIONS: readonly GroupPermission[] = ['ecriture', 'corrections'];

export interface GroupMemberDto {
  id: string; // WorkCreator id — the {id} of PATCH/DELETE /members/{id}
  accountId: string;
  name: string; // Account.displayName
  slug: string | null; // profileSlug (profile link)
  avatar: string | null;
  creatorRole: string; // WorkCreator.role: 'scenariste' | 'dessinateur' | …
  isOwner: boolean;
  groupRole: GroupRole;
  permissions: GroupPermission[]; // stored toggles
  effectivePermissions: GroupPermission[]; // leadership ⇒ all of GROUP_PERMISSIONS
  sharePct: number; // integer 0..100
}

export interface GroupPendingInviteDto {
  invitationId: string;
  name: string;
  avatar: string | null;
}

export interface GroupMembersResponse {
  projectId: string; // the invite modal (MC-3) preselects this project
  // …and labels it with this title: `GET /projects/mine` (the modal's picker source) is
  // owner-scoped, so a co-leader's list never contains the project they are managing here.
  projectTitle: string;
  members: GroupMemberDto[]; // owner first, then WorkCreator.order asc
  pending: GroupPendingInviteDto[]; // pending project invitations — display only
  viewer: { memberId: string | null; groupRole: GroupRole | null; canManage: boolean; isLeader: boolean };
  splitTotal: number; // invariant: 100
}

export interface UpdateGroupMemberRequest {
  groupRole?: GroupRole;
  permissions?: GroupPermission[];
}

export interface UpdateRevenueSplitRequest {
  shares: { memberId: string; pct: number }[]; // exactly the member set; ints; sum 100
}

/**
 * Leadership implies every permission; a plain member holds only its stored toggles.
 *
 * `permissions` is treated as absent-means-none rather than dereferenced blindly: a caller that loads
 * creator rows with a narrow select would otherwise crash this with a 500 on an authorization path.
 * Failing closed (deny) is the safe direction — and the services assert their select shape in tests, so
 * a genuinely missing select still surfaces loudly there rather than silently denying in production.
 */
export function effectiveGroupPermissions(m: { groupRole?: string; permissions?: string[] }): GroupPermission[] {
  if (m.groupRole === 'leader' || m.groupRole === 'coleader') return [...GROUP_PERMISSIONS];
  const held = m.permissions ?? [];
  return GROUP_PERMISSIONS.filter((p) => held.includes(p));
}
