import { Body, Controller, Delete, HttpCode, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SetAvatarDto } from './dto/set-avatar.dto';
import { UpdateBirthdateDto } from './dto/update-birthdate.dto';

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

  // No @Roles() — RolesGuard passes when no decorator; SessionGuard ensures auth.
  // accountId comes from session, never a path param: own-only is structural.
  @Patch('me/preferences')
  updatePreferences(
    @Req() req: AuthRequest,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<AccountSummary> {
    return this.accountsService.updatePreferences(req.accountId, dto.theme);
  }

  @Patch('me/avatar')
  setAvatar(
    @Req() req: AuthRequest,
    @Body() dto: SetAvatarDto,
  ): Promise<AccountSummary> {
    return this.accountsService.setAvatar(req.accountId, dto.mediaId);
  }

  @Delete('me/avatar')
  @HttpCode(200)
  deleteAvatar(@Req() req: AuthRequest): Promise<AccountSummary> {
    return this.accountsService.deleteAvatar(req.accountId);
  }

  // DR-10 BE-9: existing-account birthdate prompt (any authenticated user, own-only via session).
  @Patch('me/birthdate')
  setBirthdate(
    @Req() req: AuthRequest,
    @Body() dto: UpdateBirthdateDto,
  ): Promise<AccountSummary> {
    return this.accountsService.setBirthdate(req.accountId, dto.birthdate);
  }
}
