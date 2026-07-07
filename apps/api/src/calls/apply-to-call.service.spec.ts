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
  ...o,
});

// application.create returns the persisted row with the applicant relation included.
const CREATED = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'app-1',
  callId: 'call-1',
  applicantId: 'acc-applicant',
  sampleUrl: 'https://cdn/portfolio-1.webp',
  message: '',
  status: 'pending',
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  applicant: APPLICANT_ROW,
  ...o,
});

describe('CallsService.apply', () => {
  let service: CallsService;
  let prisma: {
    projectCall: { findUnique: jest.Mock; update: jest.Mock };
    application: { findFirst: jest.Mock; create: jest.Mock };
    media: { findUnique: jest.Mock };
    portfolioItem: { findUnique: jest.Mock };
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
      media: { findUnique: jest.fn() },
      portfolioItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pi-1', image: 'https://cdn/portfolio-1.webp', profile: { accountId: 'acc-applicant' } }),
      },
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

  it('creates a pending application from a portfolio sample and returns the ApplicationDto', async () => {
    const dto = await service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1', message: 'Bonjour' });
    expect(prisma.application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callId: 'call-1',
          applicantId: 'acc-applicant',
          samplePortfolioItemId: 'pi-1',
          sampleUrl: 'https://cdn/portfolio-1.webp',
          message: 'Bonjour',
        }),
      }),
    );
    expect(dto).toMatchObject({
      id: 'app-1',
      callId: 'call-1',
      status: 'pending',
      sampleUrl: 'https://cdn/portfolio-1.webp',
      applicant: { userId: 'acc-applicant', name: 'Camille Roux', slug: 'camille-roux', role: 'dessinateur' },
    });
    expect(dto.createdAt).toBe('2026-07-07T10:00:00.000Z');
  });

  it('increments the call applicationCount in the same transaction as the insert', async () => {
    await service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' });
    expect(prisma.projectCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'call-1' }, data: { applicationCount: { increment: 1 } } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // both writes were handed to $transaction as one array
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('defaults message to empty string when omitted', async () => {
    await service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' });
    expect(prisma.application.create.mock.calls[0][0].data.message).toBe('');
  });

  it('notifies the call owner with type application', async () => {
    await service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' });
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'acc-owner',
      type: 'application',
      refId: 'app-1',
      sourceUserId: 'acc-applicant',
    });
  });

  it('skips the notification (no throw) when the call has no author', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: null }));
    await service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('accepts a media sample (owned, ready, right kind) and uses its thumb variant as sampleUrl', async () => {
    prisma.media.findUnique.mockResolvedValue({
      ownerId: 'acc-applicant',
      status: 'ready',
      kind: 'application_sample',
      variants: { thumb: 'https://cdn/media-thumb.webp' },
    });
    prisma.application.create.mockResolvedValue(CREATED({ sampleUrl: 'https://cdn/media-thumb.webp', samplePortfolioItemId: null, sampleMediaId: 'med-1' }));
    const dto = await service.apply('acc-applicant', 'call-1', { sampleMediaId: 'med-1' });
    expect(prisma.application.create.mock.calls[0][0].data.sampleUrl).toBe('https://cdn/media-thumb.webp');
    expect(dto.sampleUrl).toBe('https://cdn/media-thumb.webp');
  });

  it('404s an unknown call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(null);
    await expect(service.apply('acc-applicant', 'nope', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new NotFoundException('Cet appel est introuvable.'),
    );
  });

  it('403s applying to your own call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ authorId: 'acc-applicant' }));
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new ForbiddenException('Vous ne pouvez pas candidater à votre propre appel.'),
    );
  });

  it('409s a stored-closed call', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ status: 'closed' }));
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new ConflictException('Cet appel est clôturé.'),
    );
  });

  it('409s a past-deadline call whose stored status is still open (derived closure)', async () => {
    prisma.projectCall.findUnique.mockResolvedValue(CALL_ROW({ status: 'open', closesAt: new Date(Date.now() - 1000) }));
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new ConflictException('Cet appel est clôturé.'),
    );
  });

  it('409s a duplicate application (service check)', async () => {
    prisma.application.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new ConflictException('Vous avez déjà candidaté à cet appel.'),
    );
  });

  it('maps a P2002 unique-constraint race to the same duplicate 409', async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new ConflictException('Vous avez déjà candidaté à cet appel.'),
    );
  });

  it('400s when no sample is provided', async () => {
    await expect(service.apply('acc-applicant', 'call-1', {})).rejects.toThrow(
      new BadRequestException('Ajoutez un échantillon de votre travail.'),
    );
  });

  it('400s when both sample sources are provided', async () => {
    await expect(
      service.apply('acc-applicant', 'call-1', { sampleMediaId: 'med-1', samplePortfolioItemId: 'pi-1' }),
    ).rejects.toThrow(new BadRequestException('Ajoutez un échantillon de votre travail.'));
  });

  it('400s a media sample owned by someone else', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'other', status: 'ready', kind: 'application_sample', variants: { thumb: 'x' } });
    await expect(service.apply('acc-applicant', 'call-1', { sampleMediaId: 'med-1' })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a media sample that is not ready', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'acc-applicant', status: 'pending', kind: 'application_sample', variants: {} });
    await expect(service.apply('acc-applicant', 'call-1', { sampleMediaId: 'med-1' })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a media sample of the wrong kind', async () => {
    prisma.media.findUnique.mockResolvedValue({ ownerId: 'acc-applicant', status: 'ready', kind: 'avatar', variants: { thumb: 'x' } });
    await expect(service.apply('acc-applicant', 'call-1', { sampleMediaId: 'med-1' })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s a portfolio item that belongs to another creator', async () => {
    prisma.portfolioItem.findUnique.mockResolvedValue({ id: 'pi-1', image: 'x', profile: { accountId: 'someone-else' } });
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });

  it('400s an unknown portfolio item', async () => {
    prisma.portfolioItem.findUnique.mockResolvedValue(null);
    await expect(service.apply('acc-applicant', 'call-1', { samplePortfolioItemId: 'pi-1' })).rejects.toThrow(
      new BadRequestException('Cet échantillon est invalide.'),
    );
  });
});
