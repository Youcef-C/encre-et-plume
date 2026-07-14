import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { AutosaveDocumentRequest, CreateCaseCommentRequest, EditorTemplate, PlancheDocJson, SnapshotVersionRequest } from '@encre-et-plume/shared';

// Shape validation only — membership, asset binding, and version rules live in ScenarioDocumentsService.

const HTML_CAP = 2 * 1024 * 1024; // 2 MB draft blob cap (materialization / version snapshot)

export class AutosaveDocumentDto implements AutosaveDocumentRequest {
  @IsString()
  @MaxLength(4 * 1024 * 1024) // base64 of the merged Yjs state
  ydocState!: string;

  @IsObject()
  contentJson!: PlancheDocJson;

  @IsString()
  @MaxLength(HTML_CAP)
  html!: string;

  @IsOptional()
  @IsIn(['manga', 'prose'])
  template?: EditorTemplate;
}

export class SnapshotVersionDto implements SnapshotVersionRequest {
  @IsString()
  @MaxLength(HTML_CAP)
  html!: string;

  // Item 22 — optional version note (same 2000-char cap as the modal's note field).
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateCaseCommentDto implements CreateCaseCommentRequest {
  @IsString()
  @MaxLength(2000)
  text!: string;

  // Item 5 — optional highlighted-range anchor (ProseMirror positions + quoted snippet).
  @IsOptional()
  @IsInt()
  @Min(0)
  anchorFrom?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  anchorTo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quote?: string;
}
