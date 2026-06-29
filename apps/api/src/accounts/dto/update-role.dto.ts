import { IsIn } from 'class-validator';
import { USER_ROLES, type UserRole } from '@encre-et-plume/shared';

export class UpdateRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRole;
}
