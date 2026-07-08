// MC-10 — block & mute. Self-service list under /me/blocks; enforcement is server-side.
export type BlockKind = 'block' | 'mute';

/** POST /me/blocks body. */
export interface CreateBlockRequest {
  userId: string;
  kind: BlockKind;
}

/** POST /me/blocks response — minimal echo (idempotent: re-posting returns the existing row). */
export interface BlockDto {
  id: string;
  userId: string; // the blocked/muted account
  kind: BlockKind;
  createdAt: string; // ISO 8601
}

/** GET /me/blocks item — the caller's own list ("Comptes bloqués" settings rows). */
export interface BlockItem {
  userId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  kind: BlockKind;
  createdAt: string; // ISO 8601
}

export interface BlocksResponse {
  items: BlockItem[];
}
