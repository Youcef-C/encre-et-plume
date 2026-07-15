// CS-4 — collaborative scenario editor contracts (FE + BE agree here).
// The editor's working draft is backed by a CS-3 `scenario` asset. Autosave persists the draft in
// place (never bumps the version); the explicit "new version" action snapshots a CS-3 AssetVersion.
// CRDT (Yjs) + awareness bytes are relayed opaquely over WS namespace '/editor' — the API never decodes them.

import type { AssetItem } from './assets.js';
import type { CorrectionStatus } from './corrections.js';

/** Named-caret palette; a stable hash of accountId picks the index (client-side). */
export const COLLAB_COLORS = ['#2a6fdb', '#1f8a5b', '#e8261c', '#8a3fc4', '#c47a1f', '#1f8a8a'] as const;

/** Plain-text projection of a case for the story-shaped `cases[]` (PUB-1-exploitable). */
export interface CaseSummary {
  no: number;
  description: string;
  dialogue: string;
}
/** TipTap JSON (schema: doc > caseBlock+ > caseDescription caseDialogue+). Opaque here. */
export type PlancheDocJson = Record<string, unknown>;

/** Item 20/26 — the document scheme, persisted on the ScenarioDocument. */
export type EditorTemplate = 'manga' | 'prose';

export interface CaseCommentDto {
  id: string;
  caseNo: number;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string; // ISO
  // Item 5 — optional text-range anchor. `anchorFrom`/`anchorTo` are ProseMirror positions (best-effort:
  // they can drift after collaborative edits, so `quote` is the durable snapshot of the highlighted run
  // shown as the sidebar indicator). All null → a plain case-level comment (backwards compatible).
  anchorFrom: number | null;
  anchorTo: number | null;
  quote: string | null;
  // CS-5 Fb-7 — the asset version this comment was filed against (null for pre-CS-5-r2 rows: no chip).
  version: number | null;
  // CS-5 Fb-2 — set when this comment IS a scenario correction request (a tagged CS-4 comment). The
  // sidebar renders a «Correction» chip + the status; null for an ordinary comment. `assigneeId` is
  // display data only (CS-5 r4): the editor shows the status control to the author OR assignee — server
  // authz on PATCH /corrections/:id is unchanged (author/assignee enforced there).
  correction: { id: string; status: CorrectionStatus; assigneeId: string | null } | null;
}

export interface EditorDocumentResponse {
  pageId: string;
  pageTitle: string;
  plancheNo: number; // 1-based position of this card among its chapter siblings
  total: number; // sibling count
  project: { slug: string; title: string };
  chapter: { id: string; number: number; title: string } | null;
  asset: { id: string; filename: string; currentVersion: number } | null; // null = blank, not yet materialized
  documentId: string | null;
  ydocState: string | null; // base64 persisted Yjs state — applied to the client doc BEFORE the editor
  // binds so a fresh open hydrates deterministically (no empty schema-default caseBlock racing the WS
  // sync into a duplicate). null when the doc doesn't exist yet.
  contentJson: PlancheDocJson | null; // saved draft (null when never saved)
  initialHtml: string | null; // asset exists but never opened in editor: converted .txt/.docx content
  cases: CaseSummary[]; // derived from contentJson (story shape)
  comments: CaseCommentDto[];
  template: EditorTemplate | null; // persisted scheme; null when the doc doesn't exist yet (blank card)
}

export interface AutosaveDocumentRequest {
  ydocState: string; // base64 merged Yjs state
  contentJson: PlancheDocJson;
  html: string; // current draft as HTML (materialization seed only; not versioned)
  template?: EditorTemplate; // persisted in place with the draft (no version bump)
}
export interface AutosaveDocumentResponse {
  savedAt: string; // ISO
  materialized: { assetId: string; filename: string; documentId: string } | null;
}

export interface SnapshotVersionRequest {
  html: string;
  // Item 22 — optional note attached to the new AssetVersion (same note UX as the history modal).
  note?: string;
} // → response: AssetItem (CS-3); currentVersion feeds the "v{n}" chip
export type SnapshotVersionResponse = AssetItem;

export interface CreateCaseCommentRequest {
  text: string;
  // Item 5 — optionally anchor the comment to a highlighted text range (ProseMirror positions + the
  // quoted snippet). Omit for a plain case-level comment.
  anchorFrom?: number;
  anchorTo?: number;
  quote?: string;
}
export interface SharePageResponse {
  url: string;
}

// ── WS — namespace '/editor'. CRDT & awareness payloads are opaque base64 (relayed, never decoded). ──
export const EDITOR_WS_EVENTS = {
  join: 'editor:join', // c→s { pageId }
  sync: 'editor:sync', // s→c { ydocState, updates[], initialHtml, peers }
  update: 'editor:update', // c↔s { u }
  awareness: 'editor:awareness', // c↔s { a } (presence, cursors, selections, typing)
  stateRequest: 'editor:state-request', // c→room {}
  stateResponse: 'editor:state-response', // c→room { s }
  materialized: 'editor:materialized', // s→room { assetId }
  comment: 'editor:comment', // s→room { comment }
  commentDeleted: 'editor:comment-deleted', // s→room { id } (CS-15)
} as const;

/** CS-15 — author-only comment delete (DELETE /pages/:id/document/comments/:commentId). */
export interface DeleteCaseCommentResponse {
  id: string;
}

export interface WsEditorJoin {
  pageId: string;
  /** D9 — open a CHOSEN scenario/texte asset (file dropdown / import) into the editor room. Validated
   *  server-side with the same rules as `?asset` on the REST routes (same project + scenario/texte type,
   *  else the join is silently dropped). Omit for the card's linked-scenario default. */
  assetId?: string;
}
export interface WsEditorSync {
  ydocState: string | null;
  updates: string[];
  initialHtml: string | null;
  peers: number;
}
export interface WsEditorUpdate {
  u: string;
}
export interface WsEditorAwareness {
  a: string;
}
export interface WsEditorStateResponse {
  s: string;
}
export interface WsEditorMaterialized {
  assetId: string;
}
export interface WsEditorComment {
  comment: CaseCommentDto;
}
export interface WsEditorCommentDeleted {
  id: string;
}

/** Awareness user state (client-side convention, typed here for FE reuse). */
export interface EditorAwarenessState {
  user: { id: string; name: string; color: string; role: 'pen' | 'brush'; avatar?: string | null };
  typing: boolean;
}
