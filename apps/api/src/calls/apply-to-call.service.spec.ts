import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationsService } from '../notifications/notifications.service';

const APPLICANT_ROW = {
  id: 'acc-applicant',
  displayName: 'Camille Roux',
  profileSlug: 'camille-roux',
  avatar: 'https://cdn/avatar.webp',
  profile: { creatorRoles: ['dessinateur'] },
};

const CALL_ROW = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'call-1',
  authorId: 'acc-owner',
  status: 'open',
  closesAt: null,
  seekingRoles: ['dessinateur'],
  ...o,
});

// application.create returns the persisted row with the applicant + assets relations included.
const CREATED = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1',
  callId: 'call-1',
  applicantId: 'acc-applicant',
  sampleUrl: 'https://cdn/portfolio-1.webp',
  message: '',
  status: 'pending',
  appliedAs: 'dessinateur',
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  applicant: APPLICANT_ROW,
  assets: [{ url: 'https://cdn/portfolio-1.webp', kind: 'image', size: null, position: 0 }],
  ...o,
});

const PORTFOLIO_ITEM = { id: 'pi-1', image: 'https://cdn/portfolio-1.webp', profile: { accountId: 'acc-applicant' } };

describe('CallsService.apply', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; update: jest.Mock };
    application: { findFirst: jest.Mock; create: jest.Mock };
    media: { findMany: jest.Mock };
    portfolioItem: { findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { create: jest.Mock };

  beforeEach(() => {
    prisma = {
      projectCall: {
        findUnique: jest.fn().mockResolvedValue(CALL_ROW()),
        update: jest.fn().mockResolvedValue({}),
      },
      application: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(CREATED()),
      },
      media: { findMany: jest.fn().mockResolvedValue([]) },
      portfolioItem: { findMany: jest.fn().mockResolvedValue([PORTFOLIO_ITEM]) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles: ['dessinateur'] }) },
      // realistic array-form $transaction: awaits each operation, returns results in order
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    service = new CallsService(
      prisma as unknown as PrismaService,
      {} as unknown as QueueService,
      notifications as unknown as NotificationsService,
    );
  });

  const portfolioSample = { samples: [{ portfolioItemId: 'pi-1' }] };

  it('creates a pending application from a portfolio sample and returns the ApplicationDto', async () => {
    const dto = await service.apply('acc-applicant', 'call-1', { ...portfolioSample, message: 'Bonjour' });
    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-1',
          applicantId: 'acc-applicant',
          sampleUrl: 'https://cdn/portfolio-1.webp',
          message: 'Bonjour',
          assets: {
            create: [
              expect.objectContaining({ portfolioItemId: 'pi-1', url: 'https://cdn/portfolio-1.webp', kind: 'image', position: 0 }),
            ],
          },
        }),
      }),
    );
    expect(dto).toMatchObject({
      id: 'app-1',
      callId: 'call-1',
      status: 'pending',
      sampleUrl: 'https://cdn/portfolio-1.webp',
      samples: [{ url: 'https://cdn/portfolio-1.webp', kind: 'image', size: null }],
      applicant: { userId: 'acc-applicant', name: 'Camille Roux', slug: 'camille-roux', role: 'dessinateur' },
    });
    expect(dto.createdAt).toBe('2026-07-07T10:00:00.000Z');
  });

  it('increments the call applicationCount in the same transaction as the insert', async () => {
    await service.apply('acc-applicant', 'call-1', portfolioSample);
    expect(prisma.projectCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'call-1' }, data: { applicationCount: { increment: 1 } } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('defaults message to empty string when omitted', async () => {
    await service.apply('acc-applicant', 'call-1', portfolioSample);
    expect(prisma.application.create.mock.calls[0][0].data.message).toBe('');
  });

  it('notifies the call owner with type application', async () => {
    await service.apply('acc-applicant', 'call-1', portfolioSample);
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'acc-owner',
      type: 'application',
      refId: 'app-1',
      sourceUserId: 'acc-applicant',
    });
  });

  it('skips the notification (no throw) when the call has no author', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: null }));
    await service.apply('acc-applicant', 'call-1', portfolioSample);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('accepts an uploaded image sample (owned, ready, right kind) and uses its thumb as the url', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', ownerId: 'acc-applicant', status: 'ready', kind: 'application_sample', size: null, variants: { thumb: 'https://cdn/media-thumb.webp' } },
    ]);
    prisma.application.create.mockResolvedValue(
      CREATED({ sampleUrl: 'https://cdn/media-thumb.webp', assets: [{ url: 'https://cdn/media-thumb.webp', kind: 'image', size: null, position: 0 }] }),
    );
    const dto = await service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'med-1' }] });
    expect(prisma.application.create.mock.calls[0][0].data.sampleUrl).toBe('https://cdn/media-thumb.webp');
    expect(dto.sampleUrl).toBe('https://cdn/media-thumb.webp');
  });

  it('accepts an uploaded PDF document sample (kind application_document) with its orig url + size', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'doc-1', ownerId: 'acc-applicant', status: 'ready', kind: 'application_document', size: 4096, variants: { orig: 'https://cdn/doc.pdf' } },
    ]);
    await service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'doc-1' }] });
    expect(prisma.application.create.mock.calls[0][0].data.assets.create).toEqual([
      expect.objectContaining({ mediaId: 'doc-1', url: 'https://cdn/doc.pdf', kind: 'document', size: 4096, position: 0 }),
    ]);
  });

  it('accepts up to 3 mixed samples, positioned in request order', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', ownerId: 'acc-applicant', status: 'ready', kind: 'application_sample', size: null, variants: { thumb: 'https://cdn/t.webp' } },
      { id: 'doc-1', ownerId: 'acc-applicant', status: 'ready', kind: 'application_document', size: 2048, variants: { orig: 'https://cdn/d.pdf' } },
    ]);
    await service.apply('acc-applicant', 'call-1', {
      samples: [{ portfolioItemId: 'pi-1' }, { mediaId: 'med-1' }, { mediaId: 'doc-1' }],
    });
    const assets = prisma.application.create.mock.calls[0][0].data.assets.create;
    expect(assets.map((a: { position: number }) => a.position)).toEqual([0, 1, 2]);
    expect(assets[0]).toMatchObject({ portfolioItemId: 'pi-1', kind: 'image' });
    expect(assets[2]).toMatchObject({ mediaId: 'doc-1', kind: 'document' });
  });

  it('400s when more than 3 samples are supplied', async () => {
    await expect(
      service.apply('acc-applicant', 'call-1', {
        samples: [{ portfolioItemId: 'a' }, { portfolioItemId: 'b' }, { portfolioItemId: 'c' }, { portfolioItemId: 'd' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.apply('acc-applicant', 'nope', portfolioSample)).rejects.toThrow(
      new NotFoundException('Cet appel est introuvable.'),
    );
  });

  it('403s applying to your own call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-applicant' }));
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new ForbiddenException('Vous ne pouvez pas candidater à votre propre appel.'),
    );
  });

  it('409s a stored-closed call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ status: 'closed' }));
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new ConflictException('Cet appel est clôturé.'),
    );
  });

  it('409s a past-deadline call whose stored status is still open (derived closure)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ status: 'open', closesAt: new Date(Date.now() - 1000) }));
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new ConflictException('Cet appel est clôturé.'),
    );
  });

  it('409s a duplicate application (service check)', async () => {
    prisma.application.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new ConflictException('Vous avez déjà candidaté à cet appel.'),
    );
  });

  it('maps a P2002 unique-constraint race to the same duplicate 409', async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new ConflictException('Vous avez déjà candidaté à cet appel.'),
    );
  });

  it('400s when no sample is provided (empty array)', async () => {
    await expect(service.apply('acc-applicant', 'call-1', { samples: [] })).rejects.toThrow(
      new BadRequestException('Ajoutez un échantillon de votre travail.'),
    );
  });

  it('400s a ref with both sources set', async () => {
    await expect(
      service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'med-1', portfolioItemId: 'pi-1' }] }),
    ).rejects.toThrow(new BadRequestException('Cet échantillon est invalide.'));
  });

  it('400s a media sample owned by someone else', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', ownerId: 'other', status: 'ready', kind: 'application_sample', size: null, variants: { thumb: 'x' } },
    ]);
    await expect(service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'med-1' }] })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a media sample that is not ready', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', ownerId: 'acc-applicant', status: 'pending', kind: 'application_sample', size: null, variants: {} },
    ]);
    await expect(service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'med-1' }] })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a media sample of the wrong kind', async () => {
    prisma.media.findMany.mockResolvedValue([
      { id: 'med-1', ownerId: 'acc-applicant', status: 'ready', kind: 'avatar', size: null, variants: { thumb: 'x' } },
    ]);
    await expect(service.apply('acc-applicant', 'call-1', { samples: [{ mediaId: 'med-1' }] })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a portfolio item that belongs to another creator', async () => {
    prisma.portfolioItem.findMany.mockResolvedValue([{ id: 'pi-1', image: 'x', profile: { accountId: 'someone-else' } }]);
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s an unknown portfolio item', async () => {
    prisma.portfolioItem.findMany.mockResolvedValue([]);
    await expect(service.apply('acc-applicant', 'call-1', portfolioSample)).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });
});

describe('CallsService.apply — MC-4X role gate + derived appliedAs', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; update: jest.Mock };
    application: { findFirst: jest.Mock; create: jest.Mock };
    portfolioItem: { findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const setup = (creatorRoles: string[], seekingRoles = ['dessinateur']) => {
    prisma = {
      projectCall: {
        findUnique: jest.fn().mockResolvedValue(CALL_ROW({ seekingRoles })),
        update: jest.fn().mockResolvedValue({}),
      },
      application: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(CREATED()),
      },
      portfolioItem: { findMany: jest.fn().mockResolvedValue([PORTFOLIO_ITEM]) },
      profile: { findUnique: jest.fn().mockResolvedValue({ creatorRoles }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new CallsService(
      prisma as unknown as PrismaService,
      {} as unknown as QueueService,
      { create: jest.fn().mockResolvedValue(null) } as unknown as NotificationsService,
    );
  };

  const appliedAsOf = () => prisma.application.create.mock.calls[0][0].data.appliedAs;
  const sample = (o: Record<string, unknown> = {}) => ({ samples: [{ portfolioItemId: 'pi-1' }], ...o });

  it('403s (exact FR message) when a single-role call seeks dessinateur and the applicant lacks it', async () => {
    setup(['scenariste'], ['dessinateur']);
    await expect(service.apply('acc-applicant', 'call-1', sample())).rejects.toThrow(
      new ForbiddenException('Cet appel recherche un·e dessinateur·rice — ce rôle ne fait pas partie de vos rôles de création.'),
    );
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it('403s (exact FR message) when a single-role call seeks scénariste and the applicant lacks it', async () => {
    setup(['dessinateur'], ['scenariste']);
    await expect(service.apply('acc-applicant', 'call-1', sample())).rejects.toThrow(
      new ForbiddenException('Cet appel recherche un·e scénariste — ce rôle ne fait pas partie de vos rôles de création.'),
    );
  });

  it('403s a multi-role call (lists both roles) when the applicant holds neither', async () => {
    // no applicant role matches — dessinateur & scenariste sought, applicant has neither
    setup([], ['dessinateur', 'scenariste']);
    await expect(service.apply('acc-applicant', 'call-1', sample())).rejects.toThrow(
      new ForbiddenException(
        'Cet appel recherche un·e dessinateur·rice ou un·e scénariste — aucun de ces rôles ne fait partie de vos rôles de création.',
      ),
    );
  });

  it('lets an applicant holding ANY one of the sought roles apply', async () => {
    setup(['scenariste'], ['dessinateur', 'scenariste']);
    await expect(service.apply('acc-applicant', 'call-1', sample())).resolves.toBeDefined();
  });

  it('derives appliedAs = the single matching role when the intersection is 1', async () => {
    setup(['scenariste', 'dessinateur'], ['scenariste']);
    await service.apply('acc-applicant', 'call-1', sample());
    expect(appliedAsOf()).toBe('scenariste');
  });

  it('honours an explicit appliedAs restricted to the intersection when >1 role matches', async () => {
    setup(['scenariste', 'dessinateur'], ['dessinateur', 'scenariste']);
    await service.apply('acc-applicant', 'call-1', sample({ appliedAs: 'dessinateur' }));
    expect(appliedAsOf()).toBe('dessinateur');
  });

  it('400s an explicit appliedAs outside the intersection', async () => {
    // call seeks only dessinateur; applicant is dual-role but cannot apply as scénariste here
    setup(['scenariste', 'dessinateur'], ['dessinateur']);
    await expect(service.apply('acc-applicant', 'call-1', sample({ appliedAs: 'scenariste' }))).rejects.toThrow(
      new BadRequestException("Ce rôle n'est pas disponible pour cet appel."),
    );
  });

  it('defaults appliedAs to the first match when >1 matches and none is chosen', async () => {
    setup(['scenariste', 'dessinateur'], ['dessinateur', 'scenariste']);
    await service.apply('acc-applicant', 'call-1', sample());
    expect(appliedAsOf()).toBe('dessinateur');
  });
});
