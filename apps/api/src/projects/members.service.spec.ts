import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembersService, canManageProject, hasGroupPermission, isGroupLeader } from './members.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * CS-10 group members / permissions / revenue split. Mocked Prisma (same idiom as PagesService's
 * spec): the rules under test are pure service logic on top of the WorkCreator rows.
 */

const CREATOR = (o: Record<string, unknown> = {}) => ({
  id: 'wc-owner',
  workId: 'work-1',
  accountId: 'acc-me',
  role: 'scenariste',
  order: 0,
  groupRole: 'leader',
  permissions: ['ecriture', 'corrections'],
  sharePct: 100,
  account: { id: 'acc-me', displayName: 'Moi', avatar: null, profileSlug: 'moi' },
  ...o,
});

const YUKI = (o: Record<string, unknown> = {}) =>
  CREATOR({
    id: 'wc-yuki',
    accountId: 'acc-yuki',
    role: 'dessinateur',
    order: 1,
    groupRole: 'member',
    permissions: ['ecriture', 'corrections'],
    sharePct: 0,
    account: { id: 'acc-yuki', displayName: 'Yuki Moreau', avatar: null, profileSlug: 'yuki' },
    ...o,
  });

const PROJECT = (creators: unknown[] = [CREATOR(), YUKI()], o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  title: 'Lames de brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: { id: 'work-1', creators },
  invitations: [],
  ...o,
});

describe('MembersService', () => {
  let service: MembersService;
  let prisma: any;
  let notifications: { create: jest.Mock };

  const setProject = (p: unknown) => {
    prisma.project.findUnique.mockResolvedValue(p);
    prisma.project.findFirst.mockResolvedValue(p);
  };

  const build = () => {
    prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue(PROJECT()),
        findFirst: jest.fn().mockResolvedValue(PROJECT()),
      },
      account: { findUnique: jest.fn().mockResolvedValue({ profile: { creatorRoles: ['scenariste'] } }) },
      workCreator: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 'wc-yuki', workId: 'work-1', accountId: 'acc-yuki', groupRole: 'member', sharePct: 0 }),
        // N3: the revenue-split save re-reads the member set INSIDE its transaction.
        findMany: jest.fn().mockResolvedValue([{ id: 'wc-owner' }, { id: 'wc-yuki' }]),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    service = new MembersService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService);
  };

  beforeEach(build);

  // ── GET /projects/:slug/members ────────────────────────────────────────────
  describe('getMembers', () => {
    it('returns the owner first then order asc, with effective permissions and the split total', async () => {
      const res = await service.getMembers('acc-me', 'lames-de-brume');
      expect(res.members.map((m) => m.id)).toEqual(['wc-owner', 'wc-yuki']);
      expect(res.members[0]).toMatchObject({
        accountId: 'acc-me',
        name: 'Moi',
        slug: 'moi',
        isOwner: true,
        groupRole: 'leader',
        sharePct: 100,
      });
      // leadership implies every permission, without touching the stored toggles
      expect(res.members[0].permissions).toEqual(['ecriture', 'corrections']);
      expect(res.members[0].effectivePermissions).toEqual(['ecriture', 'corrections', 'fusion']);
      expect(res.members[1].effectivePermissions).toEqual(['ecriture', 'corrections']);
      expect(res.splitTotal).toBe(100);
      expect(res.projectId).toBe('proj-1');
    });

    // The owner is a member BY DEFINITION (`isMemberOf` says so), but the group page reads
    // WorkCreator rows — a project whose owner has none rendered an empty Membres table AND an
    // empty « Partage des revenus ». Repair on read so the two can never disagree again.
    describe('a project whose owner has no membership row', () => {
      const repaired = (o: Record<string, unknown> = {}) =>
        CREATOR({ id: 'wc-new', groupRole: 'leader', sharePct: 100, ...o });

      it('adds the owner as the order-0 leader holding the whole split when alone', async () => {
        setProject(PROJECT([]));
        prisma.workCreator.create.mockImplementation(async () => {
          setProject(PROJECT([repaired()])); // the reload sees the repaired group
          return {};
        });

        const res = await service.getMembers('acc-me', 'lames-de-brume');
        expect(prisma.workCreator.create).toHaveBeenCalledWith({
          data: { workId: 'work-1', accountId: 'acc-me', role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
        });
        expect(res.members).toHaveLength(1);
        expect(res.members[0]).toMatchObject({ accountId: 'acc-me', isOwner: true, groupRole: 'leader', sharePct: 100 });
        expect(res.splitTotal).toBe(100);
        expect(res.viewer).toMatchObject({ memberId: 'wc-new', canManage: true, isLeader: true });
      });

      it('gives the owner only what the other members left, never breaking the 100 % invariant', async () => {
        setProject(PROJECT([YUKI({ sharePct: 40 })]));
        prisma.workCreator.create.mockResolvedValue({});
        await service.getMembers('acc-me', 'lames-de-brume');
        expect(prisma.workCreator.create.mock.calls[0][0].data.sharePct).toBe(60);
      });

      it('takes the owner craft from their profile', async () => {
        setProject(PROJECT([]));
        prisma.account.findUnique.mockResolvedValue({ profile: { creatorRoles: ['dessinateur'] } });
        prisma.workCreator.create.mockResolvedValue({});
        await service.getMembers('acc-me', 'lames-de-brume');
        expect(prisma.workCreator.create.mock.calls[0][0].data.role).toBe('dessinateur');
      });

      it('leaves a group that already holds its owner alone', async () => {
        await service.getMembers('acc-me', 'lames-de-brume');
        expect(prisma.workCreator.create).not.toHaveBeenCalled();
      });

      // A non-owner viewer must not trigger a write they cannot see the point of — but they must
      // still get a correct list, so the repair runs for them too. It is idempotent either way.
      it('still repairs when a plain member is the one reading', async () => {
        setProject(PROJECT([YUKI()]));
        prisma.workCreator.create.mockResolvedValue({});
        await service.getMembers('acc-yuki', 'lames-de-brume');
        expect(prisma.workCreator.create).toHaveBeenCalled();
      });
    });

    it('exposes viewer flags: a leader can manage, a plain member cannot', async () => {
      const asLeader = await service.getMembers('acc-me', 'lames-de-brume');
      expect(asLeader.viewer).toEqual({ memberId: 'wc-owner', groupRole: 'leader', canManage: true, isLeader: true });
      const asMember = await service.getMembers('acc-yuki', 'lames-de-brume');
      expect(asMember.viewer).toEqual({ memberId: 'wc-yuki', groupRole: 'member', canManage: false, isLeader: false });
    });

    it('a co-leader can manage but is not a leader', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'coleader' })]));
      const res = await service.getMembers('acc-yuki', 'lames-de-brume');
      expect(res.viewer).toEqual({ memberId: 'wc-yuki', groupRole: 'coleader', canManage: true, isLeader: false });
    });

    it('lists pending project invitations as display-only rows', async () => {
      setProject(
        PROJECT([CREATOR()], {
          invitations: [{ id: 'inv-1', toUser: { displayName: 'Léa Bonnet', avatar: null } }],
        }),
      );
      const res = await service.getMembers('acc-me', 'lames-de-brume');
      expect(res.pending).toEqual([{ invitationId: 'inv-1', name: 'Léa Bonnet', avatar: null }]);
    });

    it('404s an unknown slug', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.getMembers('acc-me', 'nope')).rejects.toThrow(NotFoundException);
    });

    it('403s a non-member on a public project, 404s on a private one (no existence leak)', async () => {
      setProject(PROJECT(undefined, { visibility: 'public' }));
      await expect(service.getMembers('acc-stranger', 'lames-de-brume')).rejects.toThrow(ForbiddenException);
      setProject(PROJECT());
      await expect(service.getMembers('acc-stranger', 'lames-de-brume')).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /members/:id ─────────────────────────────────────────────────────
  describe('updateMember', () => {
    it('a leader promotes a member to co-leader', async () => {
      await service.updateMember('acc-me', 'wc-yuki', { groupRole: 'coleader' });
      expect(prisma.workCreator.update).toHaveBeenCalledWith({ where: { id: 'wc-yuki' }, data: { groupRole: 'coleader' } });
    });

    it('a co-leader may edit permissions and promote a member to co-leader', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'coleader' }), YUKI({ id: 'wc-lea', accountId: 'acc-lea', order: 2 })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-lea', workId: 'work-1', accountId: 'acc-lea', groupRole: 'member', sharePct: 0 });
      await service.updateMember('acc-yuki', 'wc-lea', { permissions: ['fusion'] });
      expect(prisma.workCreator.update).toHaveBeenCalledWith({ where: { id: 'wc-lea' }, data: { permissions: ['fusion'] } });
    });

    it('403s a plain member (not a group manager)', async () => {
      await expect(service.updateMember('acc-yuki', 'wc-yuki', { permissions: [] })).rejects.toThrow(
        new ForbiddenException('Réservé aux chef·fes de groupe.'),
      );
    });

    it('403s a co-leader granting leadership (only a leader may touch the leader status)', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'coleader' }), YUKI({ id: 'wc-lea', accountId: 'acc-lea', order: 2 })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-lea', workId: 'work-1', accountId: 'acc-lea', groupRole: 'member', sharePct: 0 });
      await expect(service.updateMember('acc-yuki', 'wc-lea', { groupRole: 'leader' })).rejects.toThrow(
        new ForbiddenException('Seul·e un·e chef·fe de groupe peut modifier le statut de chef·fe.'),
      );
    });

    it('403s a co-leader demoting a leader', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'coleader' }), YUKI({ id: 'wc-lea', accountId: 'acc-lea', order: 2, groupRole: 'leader' })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-lea', workId: 'work-1', accountId: 'acc-lea', groupRole: 'leader', sharePct: 0 });
      await expect(service.updateMember('acc-yuki', 'wc-lea', { groupRole: 'member' })).rejects.toThrow(ForbiddenException);
    });

    it('400s the demotion of the last leader (self-demotion included)', async () => {
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-owner', workId: 'work-1', accountId: 'acc-me', groupRole: 'leader', sharePct: 100 });
      await expect(service.updateMember('acc-me', 'wc-owner', { groupRole: 'member' })).rejects.toThrow(
        new BadRequestException('Le groupe doit garder au moins un·e chef·fe de groupe.'),
      );
    });

    it('allows demoting a leader when another leader remains', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'leader' })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-yuki', workId: 'work-1', accountId: 'acc-yuki', groupRole: 'leader', sharePct: 0 });
      await service.updateMember('acc-me', 'wc-yuki', { groupRole: 'member' });
      expect(prisma.workCreator.update).toHaveBeenCalled();
    });

    it('400s an unknown role or permission value (never trusts the client)', async () => {
      await expect(service.updateMember('acc-me', 'wc-yuki', { groupRole: 'admin' as never })).rejects.toThrow(BadRequestException);
      await expect(service.updateMember('acc-me', 'wc-yuki', { permissions: ['publish'] as never })).rejects.toThrow(BadRequestException);
    });

    it('404s an unknown member id', async () => {
      prisma.workCreator.findUnique.mockResolvedValue(null);
      await expect(service.updateMember('acc-me', 'wc-nope', { permissions: [] })).rejects.toThrow(
        new NotFoundException('Membre introuvable'),
      );
    });
  });

  // ── DELETE /members/:id ────────────────────────────────────────────────────
  describe('revokeMember', () => {
    it('deletes the row and transfers its share to the owner in one transaction', async () => {
      setProject(PROJECT([CREATOR({ sharePct: 60 }), YUKI({ sharePct: 40 })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-yuki', workId: 'work-1', accountId: 'acc-yuki', groupRole: 'member', sharePct: 40 });
      await service.revokeMember('acc-me', 'wc-yuki');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.workCreator.delete).toHaveBeenCalledWith({ where: { id: 'wc-yuki' } });
      // T-API-8 (N2): atomic increment, never a precomputed sum read outside the transaction —
      // two concurrent revokes would otherwise lose one transfer and break the "sum = 100" invariant.
      expect(prisma.workCreator.update).toHaveBeenCalledWith({
        where: { id: 'wc-owner' },
        data: { sharePct: { increment: 40 } },
      });
    });

    it('notifies the revoked member (F-5)', async () => {
      await service.revokeMember('acc-me', 'wc-yuki');
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-yuki',
        type: 'project_activity',
        refId: 'proj-1',
        sourceUserId: 'acc-me',
        message: 'Vous avez été retiré·e du groupe « Lames de brume »',
      });
    });

    it('400s revoking the project owner', async () => {
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-owner', workId: 'work-1', accountId: 'acc-me', groupRole: 'leader', sharePct: 100 });
      await expect(service.revokeMember('acc-me', 'wc-owner')).rejects.toThrow(
        new BadRequestException('Le·la propriétaire du projet ne peut pas être révoqué·e.'),
      );
    });

    it('400s a revoke that would leave the group without a leader', async () => {
      setProject(PROJECT([CREATOR({ groupRole: 'coleader' }), YUKI({ groupRole: 'leader' })]));
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-yuki', workId: 'work-1', accountId: 'acc-yuki', groupRole: 'leader', sharePct: 0 });
      await expect(service.revokeMember('acc-me', 'wc-yuki')).rejects.toThrow(
        new BadRequestException('Le groupe doit garder au moins un·e chef·fe de groupe.'),
      );
    });

    it('403s a co-leader revoking a leader', async () => {
      setProject(
        PROJECT([
          CREATOR({ groupRole: 'leader' }),
          YUKI({ groupRole: 'coleader' }),
          YUKI({ id: 'wc-lea', accountId: 'acc-lea', order: 2, groupRole: 'leader' }),
        ]),
      );
      prisma.workCreator.findUnique.mockResolvedValue({ id: 'wc-lea', workId: 'work-1', accountId: 'acc-lea', groupRole: 'leader', sharePct: 0 });
      await expect(service.revokeMember('acc-yuki', 'wc-lea')).rejects.toThrow(ForbiddenException);
    });

    it('403s a plain member', async () => {
      await expect(service.revokeMember('acc-yuki', 'wc-yuki')).rejects.toThrow(ForbiddenException);
    });

    it('404s an unknown member id', async () => {
      prisma.workCreator.findUnique.mockResolvedValue(null);
      await expect(service.revokeMember('acc-me', 'wc-nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /projects/:slug/revenue-split ────────────────────────────────────
  describe('updateRevenueSplit', () => {
    it('writes every share in one transaction when the total is 100', async () => {
      await service.updateRevenueSplit('acc-me', 'lames-de-brume', {
        shares: [
          { memberId: 'wc-owner', pct: 60 },
          { memberId: 'wc-yuki', pct: 40 },
        ],
      });
      expect(prisma.workCreator.update).toHaveBeenCalledWith({ where: { id: 'wc-owner' }, data: { sharePct: 60 } });
      expect(prisma.workCreator.update).toHaveBeenCalledWith({ where: { id: 'wc-yuki' }, data: { sharePct: 40 } });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('400s when the shares do not sum to 100', async () => {
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 60 },
            { memberId: 'wc-yuki', pct: 30 },
          ],
        }),
      ).rejects.toThrow(new BadRequestException('Le total des parts doit faire 100 %.'));
    });

    it('400s when a member is missing from the payload or unknown', async () => {
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', { shares: [{ memberId: 'wc-owner', pct: 100 }] }),
      ).rejects.toThrow(new BadRequestException('Chaque membre du groupe doit avoir une part.'));
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 50 },
            { memberId: 'wc-yuki', pct: 30 },
            { memberId: 'wc-ghost', pct: 20 },
          ],
        }),
      ).rejects.toThrow(new BadRequestException('Chaque membre du groupe doit avoir une part.'));
    });

    it('400s a non-integer or out-of-range percentage', async () => {
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 60.5 },
            { memberId: 'wc-yuki', pct: 39.5 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 140 },
            { memberId: 'wc-yuki', pct: -40 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('403s a plain member', async () => {
      await expect(
        service.updateRevenueSplit('acc-yuki', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 60 },
            { memberId: 'wc-yuki', pct: 40 },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // T-API-8 (N3) — validation and writes must see ONE snapshot.
    it('re-reads the member set INSIDE the transaction (not from the pre-transaction load)', async () => {
      const seen: string[] = [];
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
        seen.push('tx-open');
        return cb({
          workCreator: {
            findMany: jest.fn().mockImplementation(() => {
              seen.push('member-set-read');
              return Promise.resolve([{ id: 'wc-owner' }, { id: 'wc-yuki' }]);
            }),
            update: jest.fn().mockImplementation(() => {
              seen.push('write');
              return Promise.resolve({});
            }),
          },
        });
      });
      await service.updateRevenueSplit('acc-me', 'lames-de-brume', {
        shares: [
          { memberId: 'wc-owner', pct: 60 },
          { memberId: 'wc-yuki', pct: 40 },
        ],
      });
      expect(seen).toEqual(['tx-open', 'member-set-read', 'write', 'write']);
    });

    it('400s (French) when a member was revoked mid-flight — never a raw P2025/500', async () => {
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          workCreator: {
            // The member set shrank between the page load and the save.
            findMany: jest.fn().mockResolvedValue([{ id: 'wc-owner' }]),
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 60 },
            { memberId: 'wc-yuki', pct: 40 },
          ],
        }),
      ).rejects.toThrow(new BadRequestException('Chaque membre du groupe doit avoir une part.'));
    });

    it('maps a residual Prisma P2025 to the French 400 instead of a 500', async () => {
      prisma.$transaction.mockImplementation(() =>
        Promise.reject(Object.assign(new Error('Record to update not found.'), { code: 'P2025' })),
      );
      await expect(
        service.updateRevenueSplit('acc-me', 'lames-de-brume', {
          shares: [
            { memberId: 'wc-owner', pct: 60 },
            { memberId: 'wc-yuki', pct: 40 },
          ],
        }),
      ).rejects.toThrow(new BadRequestException('Membre introuvable'));
    });
  });

  // ── MC-3 Mode B seam (leaders + unanimity) ─────────────────────────────────
  describe('getGroupLeaders', () => {
    it('returns every leader and co-leader accountId (unanimity seam for MC-3 Mode B)', async () => {
      setProject(PROJECT([CREATOR(), YUKI({ groupRole: 'coleader' }), YUKI({ id: 'wc-lea', accountId: 'acc-lea', order: 2 })]));
      await expect(service.getGroupLeaders('proj-1')).resolves.toEqual(['acc-me', 'acc-yuki']);
    });
  });
});

// ── exported permission seam (CS-4/CS-5 now; CS-6/CS-7/CS-9/CS-16 later) ─────
describe('permission seam', () => {
  const project = {
    ownerId: 'acc-owner',
    work: {
      creators: [
        { accountId: 'acc-owner', groupRole: 'leader', permissions: [] },
        { accountId: 'acc-co', groupRole: 'coleader', permissions: [] },
        { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture'] },
      ],
    },
  };

  it('grants every permission to the owner, the leader and the co-leader', () => {
    expect(hasGroupPermission(project, 'acc-owner', 'fusion')).toBe(true);
    expect(hasGroupPermission(project, 'acc-co', 'fusion')).toBe(true);
  });

  it('grants a plain member only its stored toggles', () => {
    expect(hasGroupPermission(project, 'acc-yuki', 'ecriture')).toBe(true);
    expect(hasGroupPermission(project, 'acc-yuki', 'corrections')).toBe(false);
    expect(hasGroupPermission(project, 'acc-yuki', 'fusion')).toBe(false);
  });

  it('denies a non-member', () => {
    expect(hasGroupPermission(project, 'acc-stranger', 'ecriture')).toBe(false);
  });

  it('isGroupLeader is true for the owner and a leader row only (CS-16 delete gate)', () => {
    expect(isGroupLeader(project, 'acc-owner')).toBe(true);
    expect(isGroupLeader(project, 'acc-co')).toBe(false);
    expect(isGroupLeader(project, 'acc-yuki')).toBe(false);
  });

  // B8-R2 — the ONE definition of "can manage this group", shared by the members routes and by
  // MC-3's POST /invitations project gate.
  it('canManageProject: owner / leader / co-leader true, plain member and stranger false', () => {
    expect(canManageProject(project, 'acc-owner')).toBe(true);
    expect(canManageProject(project, 'acc-co')).toBe(true);
    expect(canManageProject({ ...project, ownerId: 'acc-x' }, 'acc-owner')).toBe(true); // leader row
    expect(canManageProject(project, 'acc-yuki')).toBe(false);
    expect(canManageProject(project, 'acc-stranger')).toBe(false);
  });

  it('canManageProject tolerates a project with no linked work', () => {
    expect(canManageProject({ ownerId: 'acc-owner', work: null }, 'acc-owner')).toBe(true);
    expect(canManageProject({ ownerId: 'acc-owner', work: null }, 'acc-yuki')).toBe(false);
  });
});
