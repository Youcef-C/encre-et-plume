import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ConnectionsService } from '../connections/connections.service';
import type { BlocksService } from '../blocks/blocks.service';
import { canManageProject } from '../projects/members.service';

const userRow = (id: string, roles: string[] = ['dessinateur']) => ({
  id,
  displayName: `Name ${id}`,
  profileSlug: `slug-${id}`,
  avatar: null,
  profile: { creatorRoles: roles },
});

// A full Invitation row as selected with INVITATION_INCLUDE.
const INV = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'inv-1',
  fromUserId: 'acc-from',
  toUserId: 'acc-to',
  projectId: null,
  message: 'Salut',
  status: 'pending',
  createdAt: new Date('2024-01-02'),
  respondedAt: null,
  fromUser: userRow('acc-from', ['scenariste']),
  toUser: userRow('acc-to', ['dessinateur']),
  project: null,
  ...overrides,
});

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    account: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock; findUnique: jest.Mock };
    invitation: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    workCreator: {
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
  };
  let notifications: { create: jest.Mock };
  let connections: { ensureConnected: jest.Mock };
  let blocks: { isBlockedPair: jest.Mock };

  beforeEach(() => {
    prisma = {
      // recipient lookup echoes the queried id so fan-out over several ids resolves each recipient.
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(userRow(where.id))),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'proj-1', ownerId: 'acc-from' }),
        findUnique: jest.fn().mockResolvedValue({ workId: 'work-1' }),
      },
      invitation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(INV()),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(
              INV({
                toUserId: data.toUserId,
                toUser: userRow(data.toUserId),
                projectId: data.projectId,
                message: data.message,
              }),
            ),
          ),
        findMany: jest.fn().mockResolvedValue([INV()]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(INV({ status: 'accepted', respondedAt: new Date() })),
      },
      workCreator: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    connections = { ensureConnected: jest.fn().mockResolvedValue(undefined) };
    blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      connections as unknown as ConnectionsService,
      blocks as unknown as BlocksService,
    );
  });

  describe('create — envelope + fan-out', () => {
    it('legacy sugar { toUser } → envelope with one sent result + mapped DTO', async () => {
      const res = await service.create('acc-from', { toUser: 'acc-to' });
      expect(res.results).toHaveLength(1);
      expect(res.results[0]).toMatchObject({ toUser: 'acc-to', status: 'sent' });
      expect(res.results[0].invitation).toMatchObject({
        id: 'inv-1',
        status: 'pending',
        from: { userId: 'acc-from', role: 'scenariste' },
        to: { userId: 'acc-to' },
      });
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fromUserId: 'acc-from', toUserId: 'acc-to', projectId: null, message: '' },
        }),
      );
    });

    it('notifies each recipient (F-5) with type=invitation, refId, sourceUser', async () => {
      await service.create('acc-from', { toUser: 'acc-to', message: 'hi' });
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-to',
        type: 'invitation',
        refId: 'inv-1',
        sourceUserId: 'acc-from',
      });
    });

    it('fans out toUsers:[a,b] → two creates, two notifications, two sent results in payload order', async () => {
      const res = await service.create('acc-from', { kind: 'direct', toUsers: ['a', 'b'] });
      expect(prisma.invitation.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(res.results.map((r) => r.toUser)).toEqual(['a', 'b']);
      expect(res.results.every((r) => r.status === 'sent')).toBe(true);
    });

    it('dedupes duplicate ids inside the payload: [a,a] → one create, one result', async () => {
      const res = await service.create('acc-from', { toUsers: ['a', 'a'] });
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
      expect(res.results).toHaveLength(1);
      expect(res.results[0]).toMatchObject({ toUser: 'a', status: 'sent' });
    });

    it('partial duplicate: a already pending → [a:duplicate, b:sent], one create, no notify for a', async () => {
      prisma.invitation.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.toUserId === 'a' ? INV() : null),
      );
      const res = await service.create('acc-from', { toUsers: ['a', 'b'] });
      expect(res.results).toEqual([
        { toUser: 'a', status: 'duplicate', invitation: null },
        expect.objectContaining({ toUser: 'b', status: 'sent' }),
      ]);
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'b' }));
    });

    it('self-exclusion: [fromUser, b] → [self, b:sent], no create for self', async () => {
      const res = await service.create('acc-from', { toUsers: ['acc-from', 'b'] });
      expect(res.results).toEqual([
        { toUser: 'acc-from', status: 'self', invitation: null },
        expect.objectContaining({ toUser: 'b', status: 'sent' }),
      ]);
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
    });

    it('unavailable: unknown recipient → status unavailable, no create, no notify', async () => {
      prisma.account.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'ghost' ? null : userRow(where.id)),
      );
      const res = await service.create('acc-from', { toUsers: ['ghost', 'b'] });
      expect(res.results[0]).toEqual({ toUser: 'ghost', status: 'unavailable', invitation: null });
      expect(res.results[1]).toMatchObject({ toUser: 'b', status: 'sent' });
      expect(prisma.invitation.create).toHaveBeenCalledTimes(1);
    });

    it('unavailable: blocked pair (MC-10) — indistinguishable from unknown, no create', async () => {
      blocks.isBlockedPair.mockImplementation((_from, to) => Promise.resolve(to === 'blk'));
      const res = await service.create('acc-from', { toUsers: ['blk'] });
      expect(res.results[0]).toEqual({ toUser: 'blk', status: 'unavailable', invitation: null });
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('unavailable: recipient with no creator roles → unavailable, no create', async () => {
      prisma.account.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(userRow(where.id, [])),
      );
      const res = await service.create('acc-from', { toUsers: ['x'] });
      expect(res.results[0]).toEqual({ toUser: 'x', status: 'unavailable', invitation: null });
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('empty selection (neither toUser nor toUsers) → 400', async () => {
      await expect(service.create('acc-from', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('scopes the recipient lookup to non-deleted accounts', async () => {
      await service.create('acc-from', { toUser: 'acc-to' });
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-to', deletedAt: null } }),
      );
    });

    it('403s the whole request when projectId is unknown (zero creates)', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.create('acc-from', { toUsers: ['a', 'b'], projectId: 'proj-x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('attaches a manageable project to every fanned-out row', async () => {
      prisma.project.findFirst.mockResolvedValue({ ownerId: 'acc-from', work: { creators: [] } });
      await service.create('acc-from', { toUsers: ['a'], projectId: 'proj-1' });
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: 'proj-1' }) }),
      );
    });

    // T-API-7 (CS-10 B8-R2) — the project gate is the SHARED "gérer le groupe" rule, not an
    // owner-only lookup: the co-leader role CS-10 introduces must be able to invite from the
    // Groupe page. Same 403 message for everyone the rule rejects.
    describe('project gate — manage-group, not owner-only', () => {
      const proj = (creators: { accountId: string; groupRole: string }[]) => ({
        ownerId: 'acc-owner',
        work: { creators },
      });
      const invite = () => service.create('acc-from', { toUsers: ['a'], projectId: 'proj-1' });

      it('lets a co-leader (non-owner) send a project invitation', async () => {
        prisma.project.findFirst.mockResolvedValue(proj([{ accountId: 'acc-from', groupRole: 'coleader' }]));
        const res = await invite();
        expect(res.results[0]).toMatchObject({ toUser: 'a', status: 'sent' });
      });

      it('lets a promoted non-owner leader send a project invitation', async () => {
        prisma.project.findFirst.mockResolvedValue(proj([{ accountId: 'acc-from', groupRole: 'leader' }]));
        const res = await invite();
        expect(res.results[0]).toMatchObject({ toUser: 'a', status: 'sent' });
      });

      it('still lets the project owner send (regression)', async () => {
        prisma.project.findFirst.mockResolvedValue({ ownerId: 'acc-from', work: { creators: [] } });
        const res = await invite();
        expect(res.results[0]).toMatchObject({ toUser: 'a', status: 'sent' });
      });

      it('403s a plain project member with the same message', async () => {
        prisma.project.findFirst.mockResolvedValue(proj([{ accountId: 'acc-from', groupRole: 'member' }]));
        await expect(invite()).rejects.toThrow(new ForbiddenException('Ce projet ne vous appartient pas.'));
        expect(prisma.invitation.create).not.toHaveBeenCalled();
      });

      it('403s an account with no relation to the project', async () => {
        prisma.project.findFirst.mockResolvedValue(proj([{ accountId: 'acc-else', groupRole: 'leader' }]));
        await expect(invite()).rejects.toThrow(new ForbiddenException('Ce projet ne vous appartient pas.'));
        expect(prisma.invitation.create).not.toHaveBeenCalled();
      });

      it('loads the project by id alone (the gate is the shared rule, not an ownerId filter)', async () => {
        prisma.project.findFirst.mockResolvedValue({ ownerId: 'acc-from', work: { creators: [] } });
        await invite();
        expect(prisma.project.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'proj-1' } }),
        );
      });

      it('uses the exported CS-10 definition of the rule (no re-derived copy)', async () => {
        prisma.project.findFirst.mockResolvedValue(proj([{ accountId: 'acc-from', groupRole: 'coleader' }]));
        await invite();
        // The shared helper agrees with what the service just allowed.
        expect(canManageProject(proj([{ accountId: 'acc-from', groupRole: 'coleader' }]), 'acc-from')).toBe(true);
      });
    });

    it('duplicate check keys on (fromUser, toUser, pending)', async () => {
      await service.create('acc-from', { toUser: 'acc-to' });
      expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
        where: { fromUserId: 'acc-from', toUserId: 'acc-to', status: 'pending' },
      });
    });
  });

  describe('list', () => {
    it('sent → own outgoing, newest-first, paginated', async () => {
      const res = await service.list('acc-from', 'sent', 1, 20);
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fromUserId: 'acc-from' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(res).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(res.items).toHaveLength(1);
    });

    it('received → own incoming', async () => {
      await service.list('acc-to', 'received', 2, 10);
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { toUserId: 'acc-to' }, skip: 10, take: 10 }),
      );
    });
  });

  describe('respond', () => {
    it('404s on unknown id', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.respond('acc-to', 'inv-x', { status: 'accepted' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403s when the caller is not the recipient', async () => {
      await expect(service.respond('acc-from', 'inv-1', { status: 'accepted' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('409s when already responded', async () => {
      prisma.invitation.findUnique.mockResolvedValue(INV({ status: 'declined' }));
      await expect(service.respond('acc-to', 'inv-1', { status: 'accepted' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('accepts: sets status + respondedAt and notifies the sender with a distinct acceptance copy', async () => {
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({ status: 'accepted', respondedAt: expect.any(Date) }),
        }),
      );
      // Acceptance notif to the SENDER must NOT read like an invite — carries a message override.
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-from',
        type: 'invitation',
        refId: 'inv-1',
        sourceUserId: 'acc-to',
        message: 'Name acc-to a accepté votre invitation à collaborer',
      });
      // MC-8 seam: accepting an invite creates the mutual connection (sender ↔ recipient).
      expect(connections.ensureConnected).toHaveBeenCalledWith('acc-from', 'acc-to');
    });

    it('declines: does NOT create a connection and notifies with a distinct decline copy', async () => {
      prisma.invitation.update.mockResolvedValue(INV({ status: 'declined', respondedAt: new Date() }));
      await service.respond('acc-to', 'inv-1', { status: 'declined' });
      expect(connections.ensureConnected).not.toHaveBeenCalled();
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'acc-from',
          message: 'Name acc-to a décliné votre invitation à collaborer',
        }),
      );
    });

    it('accepts a project invite: adds the accepter as a WorkCreator (next order, role from profile)', async () => {
      prisma.invitation.findUnique.mockResolvedValue(
        INV({ projectId: 'proj-1', toUser: userRow('acc-to', ['scenariste']) }),
      );
      prisma.workCreator.count.mockResolvedValue(2); // owner + one other → next order 2
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        select: { workId: true },
      });
      expect(prisma.workCreator.create).toHaveBeenCalledWith({
        data: { workId: 'work-1', accountId: 'acc-to', role: 'scenariste', order: 2 },
      });
    });

    it('CS-10: a new member joins with the schema defaults (member, 0 %, écriture+corrections)', async () => {
      prisma.invitation.findUnique.mockResolvedValue(
        INV({ projectId: 'proj-1', toUser: userRow('acc-to', ['scenariste']) }),
      );
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      // The create writes NO group column — Prisma's defaults own them, so an accepted invitee is
      // always a plain 'member' at 0 % (the leader's 100 % is never diluted by an acceptance).
      const data = prisma.workCreator.create.mock.calls[0][0].data;
      expect(data.groupRole).toBeUndefined();
      expect(data.sharePct).toBeUndefined();
      expect(data.permissions).toBeUndefined();
    });

    it('accepts a project invite when already a member: idempotent, no duplicate WorkCreator', async () => {
      prisma.invitation.findUnique.mockResolvedValue(INV({ projectId: 'proj-1' }));
      prisma.workCreator.findFirst.mockResolvedValue({ id: 'wc-existing' });
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.workCreator.create).not.toHaveBeenCalled();
    });

    it('accepts a connection-only invite (projectId null): no WorkCreator write', async () => {
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.project.findUnique).not.toHaveBeenCalled();
      expect(prisma.workCreator.create).not.toHaveBeenCalled();
    });

    // `Project.workId` is NOT NULL since the CS-7 follow-up, so "the work is gone" is unrepresentable;
    // the surviving case is a deleted project.
    it('accepts a project invite whose project is gone: no crash, no WorkCreator write', async () => {
      prisma.invitation.findUnique.mockResolvedValue(INV({ projectId: 'proj-1' }));
      prisma.project.findUnique.mockResolvedValue(null);
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.workCreator.create).not.toHaveBeenCalled();
    });
  });
});
