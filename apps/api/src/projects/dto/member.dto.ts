import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import type { GroupPermission, GroupRole, UpdateGroupMemberRequest, UpdateRevenueSplitRequest } from '@encre-et-plume/shared';
import { GROUP_PERMISSIONS, GROUP_ROLES } from '@encre-et-plume/shared';

// Shape validation only — the group rules (manage gate, last-leader invariant, exact member set,
// sum = 100) live in MembersService (the trust boundary + tests).

export class UpdateGroupMemberDto implements UpdateGroupMemberRequest {
  @IsOptional()
  @IsIn(GROUP_ROLES as unknown as string[])
  groupRole?: GroupRole;

  @IsOptional()
  @IsArray()
  @IsIn(GROUP_PERMISSIONS as unknown as string[], { each: true })
  permissions?: GroupPermission[];
}

export class RevenueShareDto {
  @IsString()
  memberId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  pct!: number;
}

export class UpdateRevenueSplitDto implements UpdateRevenueSplitRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RevenueShareDto)
  shares!: RevenueShareDto[];
}
