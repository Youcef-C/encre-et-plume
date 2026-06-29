import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('accounts')
@UseGuards(SessionGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Patch(':id/role')
  @Roles('admin')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<AccountSummary> {
    return this.accountsService.updateRole(id, dto.role);
  }
}
