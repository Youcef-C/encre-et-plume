import { BadRequestException } from '@nestjs/common';
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
  anchorRelFrom?: Uint8Array | null;
  anchorRelTo?: Uint8Array | null;
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
    // CS-22 — the durable relative anchors go back out as base64 (same bytes in, same bytes out).
    anchorRelFrom: b64(c.anchorRelFrom),
    anchorRelTo: b64(c.anchorRelTo),
    version: c.version ?? null,
    correction: c.correction ?? null,
  };
}

const b64 = (b?: Uint8Array | null): string | null => (b && b.length > 0 ? Buffer.from(b).toString('base64') : null);

/** CS-22 — the trust boundary for a relative anchor: base64 shape + a 512-byte cap, then straight to
 *  bytes. Deliberately NOT a Yjs decode — the API treats these like every other CRDT payload (opaque).
 *  Shared by both ScenarioComment write paths (plain comment + tagged scenario correction). */
const MAX_ANCHOR_BYTES = 512;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export function decodeAnchorBytes(value?: string | null): Uint8Array<ArrayBuffer> | null {
  if (value == null || value === '') return null;
  if (!BASE64_RE.test(value) || value.length % 4 !== 0) throw new BadRequestException('Ancre invalide');
  const buf = Buffer.from(value, 'base64');
  if (buf.byteLength === 0 || buf.byteLength > MAX_ANCHOR_BYTES) throw new BadRequestException('Ancre invalide');
  // Prisma `Bytes` is `Uint8Array<ArrayBuffer>`; copy out of Node's pooled Buffer so the type (and
  // the backing memory) is exactly that.
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
