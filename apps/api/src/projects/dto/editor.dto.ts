import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
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
}

export class CreateCaseCommentDto implements CreateCaseCommentRequest {
  @IsString()
  @MaxLength(2000)
  text!: string;
}
