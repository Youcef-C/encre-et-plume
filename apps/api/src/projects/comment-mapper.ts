import type { CaseCommentDto, CorrectionStatus } from '@encre-et-plume/shared';

// Dependency-free comment→DTO mapper, shared by ScenarioDocumentsService and CorrectionsService.getReview.
// Lives in its own module (no service imports) so importing it never closes the
// assets↔corrections↔scenario-documents CommonJS require cycle that broke DI boot (CS-5 r3 P0).
export type CommentRow = {
  id: string;
  caseNo: number;
  authorId: string;
  text: string;
  createdAt: Date;
  author: { displayName: string };
  anchorFrom?: number | null;
  anchorTo?: number | null;
  quote?: string | null;
  version?: number | null;
  correction?: { id: string; status: CorrectionStatus; assigneeId: string | null } | null;
};

export function toCommentDto(c: CommentRow): CaseCommentDto {
  return {
    id: c.id,
    caseNo: c.caseNo,
    authorId: c.authorId,
    authorName: c.author.displayName,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    anchorFrom: c.anchorFrom ?? null,
    anchorTo: c.anchorTo ?? null,
    quote: c.quote ?? null,
    version: c.version ?? null,
    correction: c.correction ?? null,
  };
}
