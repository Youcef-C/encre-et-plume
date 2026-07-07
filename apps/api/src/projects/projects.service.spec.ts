import { ProjectsService, toProjectSummary } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';

const PROJECT = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  title: 'Lames de Brume',
  kind: 'Manga',
  genre: 'Seinen',
  status: 'en cours',
  cover: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

describe('toProjectSummary', () => {
  it('composes meta as "kind · genre · status"', () => {
    expect(toProjectSummary(PROJECT())).toEqual({
      id: 'proj-1',
      title: 'Lames de Brume',
      meta: 'Manga · Seinen · en cours',
      cover: null,
    });
  });

  it('omits a null genre from the meta line', () => {
    expect(toProjectSummary(PROJECT({ genre: null })).meta).toBe('Manga · en cours');
  });
});

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: { project: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { project: { findMany: jest.fn().mockResolvedValue([PROJECT()]) } };
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('returns only the caller\'s projects, newest-first, mapped to summaries', async () => {
    const res = await service.getMine('acc-me');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'acc-me' },
      orderBy: { createdAt: 'desc' },
    });
    expect(res).toEqual({ items: [{ id: 'proj-1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null }] });
  });
});
