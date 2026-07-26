import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { GroupMembersResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MembersService } from './members.service';
import { UpdateGroupMemberDto, UpdateRevenueSplitDto } from './dto/member.dto';

/**
 * CS-10 "Gérer le groupe". Project-scoped routes live on /projects/:slug (workspace idiom); the
 * per-member routes live on /members/:id (`:id` = the WorkCreator row). Authz is enforced in the
 * service: reads are member-gated, every mutation is leader/co-leader-only.
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class GroupMembersController {
  constructor(private readonly members: MembersService) {}

  /** The whole group: members (roles, permissions, shares), pending invitations, viewer flags. */
  @Get(':slug/members')
  list(@Req() req: AuthRequest, @Param('slug') slug: string): Promise<GroupMembersResponse> {
    return this.members.getMembers(req.accountId, slug);
  }

  /** Rewrite the whole split at once — must cover exactly the member set and total 100 %. */
  @Patch(':slug/revenue-split')
  updateSplit(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Body() dto: UpdateRevenueSplitDto,
  ): Promise<GroupMembersResponse> {
    return this.members.updateRevenueSplit(req.accountId, slug, dto);
  }
}

@Controller('members')
@UseGuards(SessionGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** Change a member's group role and/or permission toggles. Returns the refreshed group. */
  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateGroupMemberDto): Promise<GroupMembersResponse> {
    return this.members.updateMember(req.accountId, id, dto);
  }

  /** Revoke a member: deletes the membership row and transfers its share back to the owner. */
  @Delete(':id')
  revoke(@Req() req: AuthRequest, @Param('id') id: string): Promise<GroupMembersResponse> {
    return this.members.revokeMember(req.accountId, id);
  }
}
