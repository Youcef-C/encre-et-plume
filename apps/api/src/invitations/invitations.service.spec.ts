import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ConnectionsService } from '../connections/connections.service';
import type { BlocksService } from '../blocks/blocks.service';

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
    project: { findFirst: jest.Mock };
    invitation: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let notifications: { create: jest.Mock };
  let connections: { ensureConnected: jest.Mock };
  let blocks: { isBlockedPair: jest.Mock };

  beforeEach(() => {
    prisma = {
      account: { findFirst: jest.fn().mockResolvedValue(userRow('acc-to')) },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'proj-1', ownerId: 'acc-from' }) },
      invitation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(INV()),
        create: jest.fn().mockResolvedValue(INV()),
        findMany: jest.fn().mockResolvedValue([INV()]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(INV({ status: 'accepted', respondedAt: new Date() })),
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

  describe('create', () => {
    it('persists the invitation and returns a mapped DTO with defaults', async () => {
      const dto = await service.create('acc-from', { toUser: 'acc-to' });
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fromUserId: 'acc-from', toUserId: 'acc-to', projectId: null, message: '' },
        }),
      );
      expect(dto).toMatchObject({
        id: 'inv-1',
        status: 'pending',
        from: { userId: 'acc-from', name: 'Name acc-from', slug: 'slug-acc-from', role: 'scenariste' },
        to: { userId: 'acc-to', role: 'dessinateur' },
        project: null,
        respondedAt: null,
      });
    });

    it('notifies the recipient (F-5) with type=invitation, refId, sourceUser', async () => {
      await service.create('acc-from', { toUser: 'acc-to', message: 'hi' });
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-to',
        type: 'invitation',
        refId: 'inv-1',
        sourceUserId: 'acc-from',
      });
    });

    it('rejects self-invite (400)', async () => {
      await expect(service.create('acc-me', { toUser: 'acc-me' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('404s when the recipient is unknown or tombstoned', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.create('acc-from', { toUser: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('MC-10: 404s a blocked pair with the identical not-found wording', async () => {
      blocks.isBlockedPair.mockResolvedValue(true);
      await expect(service.create('acc-from', { toUser: 'acc-to' })).rejects.toThrow(
        'Ce créateur est introuvable.',
      );
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('scopes the recipient lookup to non-deleted accounts', async () => {
      await service.create('acc-from', { toUser: 'acc-to' });
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-to', deletedAt: null } }),
      );
    });

    it('422s when the recipient has no creator roles', async () => {
      prisma.account.findFirst.mockResolvedValue(userRow('acc-to', []));
      await expect(service.create('acc-from', { toUser: 'acc-to' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('403s when projectId is not owned by the sender', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.create('acc-from', { toUser: 'acc-to', projectId: 'proj-x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('attaches an owned project', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1', ownerId: 'acc-from' });
      await service.create('acc-from', { toUser: 'acc-to', projectId: 'proj-1' });
      expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'proj-1', ownerId: 'acc-from' } });
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: 'proj-1' }) }),
      );
    });

    it('409s on a duplicate pending invite to the same recipient (key = fromUser,toUser)', async () => {
      prisma.invitation.findFirst.mockResolvedValue(INV());
      await expect(service.create('acc-from', { toUser: 'acc-to' })).rejects.toBeInstanceOf(ConflictException);
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

    it('accepts: sets status + respondedAt and notifies the sender', async () => {
      await service.respond('acc-to', 'inv-1', { status: 'accepted' });
      expect(prisma.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({ status: 'accepted', respondedAt: expect.any(Date) }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-from',
        type: 'invitation',
        refId: 'inv-1',
        sourceUserId: 'acc-to',
      });
      // MC-8 seam: accepting an invite creates the mutual connection (sender ↔ recipient).
      expect(connections.ensureConnected).toHaveBeenCalledWith('acc-from', 'acc-to');
    });

    it('declines: does NOT create a connection', async () => {
      prisma.invitation.update.mockResolvedValue(INV({ status: 'declined', respondedAt: new Date() }));
      await service.respond('acc-to', 'inv-1', { status: 'declined' });
      expect(connections.ensureConnected).not.toHaveBeenCalled();
    });
  });
});
