import { CallsService, parseCallsLimit } from './calls.service';
import { PrismaService } from '../prisma/prisma.service';

const CALL_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'call-1',
  title: '« Lames de Brume »',
  authorRole: 'scenariste',
  seekingRole: 'dessinateur',
  authorName: 'Camille R.',
  tags: ['Seinen', 'Thriller'],
  closesAt: null,
  applicationCount: 5,
  ...overrides,
});

describe('parseCallsLimit', () => {
  it('defaults to 2', () => {
    expect(parseCallsLimit(undefined)).toBe(2);
  });
  it('clamps to a max of 6', () => {
    expect(parseCallsLimit('99')).toBe(6);
  });
  it('falls back to default on non-numeric / below-range input', () => {
    expect(parseCallsLimit('0')).toBe(2);
    expect(parseCallsLimit('abc')).toBe(2);
  });
});

describe('CallsService', () => {
  let service: CallsService;
  let prisma: { projectCall: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { projectCall: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new CallsService(prisma as unknown as PrismaService);
  });

  it('queries only open calls, newest first, limited', async () => {
    await service.findOpenCalls(2);
    expect(prisma.projectCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 2 }),
    );
  });

  it('composes the heading server-side from author/seeking roles', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].heading).toBe('SCÉNARISTE CHERCHE DESSINATEUR·RICE');
  });

  it('returns closesInDays null when closesAt is unset (falls back to applicationCount on FE)', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt: null })]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].closesInDays).toBeNull();
    expect(res.items[0].applicationCount).toBe(5);
  });

  it('computes closesInDays as whole days until closesAt (ceil)', async () => {
    const closesAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000 - 1000); // just under 12 days → ceil 12
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW({ closesAt })]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0].closesInDays).toBe(12);
  });

  it('maps the full CallPreview contract', async () => {
    prisma.projectCall.findMany.mockResolvedValue([CALL_ROW()]);
    const res = await service.findOpenCalls(2);
    expect(res.items[0]).toEqual({
      id: 'call-1',
      heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
      title: '« Lames de Brume »',
      tags: ['Seinen', 'Thriller'],
      authorName: 'Camille R.',
      closesInDays: null,
      applicationCount: 5,
    });
  });
});
