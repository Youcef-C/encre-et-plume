import { PrismaService } from '../prisma/prisma.service';
import { IllustrationsSearchProvider, WorksSearchProvider } from './search.providers';

const CTX = { accountId: 'acc-viewer', limit: 8 };

// ─── WorksSearchProvider (DR-3 corpus — the group F-7 declared and never built) ────────────────

describe('WorksSearchProvider', () => {
  function make(rows: unknown[] = []) {
    const prisma = { work: { findMany: jest.fn().mockResolvedValue(rows) } };
    return { provider: new WorksSearchProvider(prisma as unknown as PrismaService), findMany: prisma.work.findMany };
  }

  it('declares the "works" group', () => {
    expect(make().provider.type).toBe('works');
  });

  it('matches on the title OR the author name — the capability the dropped meta column used to carry', async () => {
    const { provider, findMany } = make();

    await provider.search('brume', CTX);

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.publishedAt).toEqual({ not: null });
    expect(arg.where.OR).toEqual([
      { title: { contains: 'brume', mode: 'insensitive' } },
      { creators: { some: { account: { displayName: { contains: 'brume', mode: 'insensitive' } } } } },
    ]);
    expect(arg.take).toBe(8);
  });

  it('maps a work row to a SearchResultItem routed at /oeuvre/:slug', async () => {
    const { provider } = make([
      { id: 'w1', slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: 'https://cdn/lames.jpg' },
    ]);

    expect(await provider.search('brume', CTX)).toEqual([
      { id: 'w1', type: 'works', title: 'Lames de Brume', thumbnail: 'https://cdn/lames.jpg', route: '/oeuvre/lames-de-brume' },
    ]);
  });

  it('never leaks an unpublished work', async () => {
    const { provider, findMany } = make();
    await provider.search('brume', CTX);
    expect(findMany.mock.calls[0][0].where.publishedAt).toEqual({ not: null });
  });
});

// ─── IllustrationsSearchProvider (DR-5 corpus) ─────────────────────────────────────────────────

describe('IllustrationsSearchProvider', () => {
  function make(rows: unknown[] = []) {
    const prisma = { illustration: { findMany: jest.fn().mockResolvedValue(rows) } };
    return {
      provider: new IllustrationsSearchProvider(prisma as unknown as PrismaService),
      findMany: prisma.illustration.findMany,
    };
  }

  it('declares the "illustrations" group', () => {
    expect(make().provider.type).toBe('illustrations');
  });

  it('matches on the title OR the artist name, published only', async () => {
    const { provider, findMany } = make();

    await provider.search('néons', CTX);

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.publishedAt).toEqual({ not: null });
    expect(arg.where.OR).toEqual([
      { title: { contains: 'néons', mode: 'insensitive' } },
      { artistName: { contains: 'néons', mode: 'insensitive' } },
    ]);
    expect(arg.take).toBe(8);
  });

  it('maps an illustration row to a SearchResultItem routed at /illustration/:id', async () => {
    const { provider } = make([{ id: 'i1', title: 'Pluie de Néons', image: 'https://cdn/i1.jpg' }]);

    expect(await provider.search('néons', CTX)).toEqual([
      { id: 'i1', type: 'illustrations', title: 'Pluie de Néons', thumbnail: 'https://cdn/i1.jpg', route: '/illustration/i1' },
    ]);
  });
});
