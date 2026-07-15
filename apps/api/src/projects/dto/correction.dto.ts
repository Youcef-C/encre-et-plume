import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type {
  CorrectionStatus,
  CorrectionType,
  DessinAnchor,
  ScenarioAnchor,
  UpdateCorrectionRequest,
} from '@encre-et-plume/shared';
import { CORRECTION_STATUSES } from '@encre-et-plume/shared';

// Shape validation only — the cross-field anchor bounds (from<to, region ⊆ 0–1), asset/document
// binding, membership and version stamping all live in CorrectionsService (single source of truth).

export class CreateCorrectionDto {
  @IsIn(['scenario', 'dessin'])
  type!: CorrectionType;

  @IsObject()
  anchor!: ScenarioAnchor | DessinAnchor;

  @IsOptional()
  @IsString()
  assetId?: string; // required for dessin (validated in the service)

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  caseNo?: number; // scenario only — the case the tagged comment attaches to (default 1)

  @IsOptional()
  @IsString()
  @MaxLength(40)
  caseRef?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class UpdateCorrectionDto implements UpdateCorrectionRequest {
  @IsIn(CORRECTION_STATUSES as unknown as string[])
  status!: CorrectionStatus;
}
