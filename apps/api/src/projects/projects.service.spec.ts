import { ProjectsService, toProjectSummary } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsService } from '../collections/collections.service';
import type { ParsedMyProjectsQuery } from './parse-my-projects-query';

const PROJECT = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  title: 'Lames de Brume',
  kind: 'Manga',
  genre: 'Seinen',
  status: 'en cours',
  cover: null,
  slug: 'lames-de-brume',
  step: 'encrage Ch.1',
  nextReleaseAt: null,
  createdAt: new Date('2024-03-01'),
  invitations: [],
  ...overrides,
});

const OWNER = {
  id: 'acc-me',
  displayName: 'Moi',
  profile: { creatorRoles: ['scenariste'] },
};

const q = (o: Partial<ParsedMyProjectsQuery> = {}): ParsedMyProjectsQuery => ({
  scope: 'all',
  status: 'tous',
  type: 'tous',
  page: 1,
  ...o,
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
  let prisma: {
    project: { findMany: jest.Mock };
    account: { findUnique: jest.Mock };
    illustration: { findMany: jest.Mock };
  };
  let collections: { getMine: jest.Mock };

  const build = (projects: unknown[], mine: unknown[] = [], illus: unknown[] = []) => {
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue(projects) },
      account: { findUnique: jest.fn().mockResolvedValue(OWNER) },
      illustration: { findMany: jest.fn().mockResolvedValue(illus) },
    };
    collections = { getMine: jest.fn().mockResolvedValue(mine) };
    service = new ProjectsService(prisma as unknown as PrismaService, collections as unknown as CollectionsService);
  };

  beforeEach(() => build([PROJECT()]));

  // ── legacy picker path (MC-3 / MC-4) ─────────────────────────────────────
  it('legacy: no-arg call returns the caller\'s projects as bare summaries, no collections/summary', async () => {
    const res = await service.getMine('acc-me');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'acc-me' },
      orderBy: { createdAt: 'desc' },
    });
    expect(collections.getMine).not.toHaveBeenCalled();
    expect(res).toEqual({ items: [{ id: 'proj-1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null }] });
  });

  it('legacy: scope=projects behaves like the no-arg call', async () => {
    const res = await service.getMine('acc-me', q({ scope: 'projects' }));
    expect(collections.getMine).not.toHaveBeenCalled();
    expect(res.summary).toBeUndefined();
    expect(res.items[0]).toEqual({ id: 'proj-1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null });
  });

  // ── dashboard path (scope=all) ───────────────────────────────────────────
  it('folds in CollectionsService.getMine rows as kind:collection / type:Illustration(s)', async () => {
    build([PROJECT()], [{ id: 'col-1', slug: 'carnet-encre', title: 'Carnet d\'encre', cover: null, count: 12 }]);
    const res = await service.getMine('acc-me', q());
    const col = res.items.find((i) => i.kind === 'collection')!;
    expect(col).toMatchObject({
      id: 'col-1',
      slug: 'carnet-encre', // Voir → /oeuvre/{slug}
      type: 'Illustration(s)',
      status: null, // series-only: collections carry no lifecycle status
      illustrationCount: 12,
      kind: 'collection',
    });
    const proj = res.items.find((i) => i.kind === 'project')!;
    expect(proj).toMatchObject({ id: 'proj-1', type: 'Manga', status: 'en cours', slug: 'lames-de-brume', step: 'encrage Ch.1', illustrationCount: null });
  });

  it('folds in the caller\'s uncollected illustrations as kind:illustration rows', async () => {
    const illu = { id: 'illu-1', title: 'Étude d\'encre', image: 'img.jpg', createdAt: new Date('2024-05-01') };
    build([PROJECT()], [], [illu]);
    const res = await service.getMine('acc-me', q());
    const row = res.items.find((i) => i.kind === 'illustration')!;
    expect(row).toMatchObject({
      id: 'illu-1',
      title: 'Étude d\'encre',
      cover: 'img.jpg',
      type: 'illustration',
      status: null,
      slug: null,
      kind: 'illustration',
      illustrationCount: null,
    });
    expect(row.members).toEqual([{ id: 'acc-me', name: 'Moi', role: 'scenariste', self: true }]);
  });

  it('queries only the caller\'s UNCOLLECTED illustrations (no double-count with collections)', async () => {
    build([PROJECT()], [], []);
    await service.getMine('acc-me', q());
    expect(prisma.illustration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: 'acc-me', collections: { none: {} } } }),
    );
  });

  it('type=illustrations returns ALL illustrations flat (incl. collected), no collection rows', async () => {
    const col = [{ id: 'c1', slug: 's', title: 'C', cover: null, count: 1 }];
    // In this view the illustration query drops the `none` filter, so the mock returns collected + uncollected.
    const illu = [
      { id: 'i-uncollected', title: 'Solo', image: null, createdAt: new Date('2024-05-01') },
      { id: 'i-collected', title: 'Membre', image: null, createdAt: new Date('2024-04-01') },
    ];
    build([PROJECT({ kind: 'Manga' })], col, illu);
    const res = await service.getMine('acc-me', q({ type: 'illustrations' }));
    expect(res.items.every((i) => i.kind === 'illustration')).toBe(true);
    expect(res.items.map((i) => i.id).sort()).toEqual(['i-collected', 'i-uncollected']);
    // the illustration query must NOT restrict to uncollected in this view
    expect(prisma.illustration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: 'acc-me' } }),
    );
  });

  it('type=collections returns only collection rows (no flat illustrations)', async () => {
    const col = [{ id: 'c1', slug: 's', title: 'C', cover: null, count: 1 }];
    const illu = [{ id: 'i1', title: 'Solo', image: null, createdAt: new Date('2024-05-01') }];
    build([PROJECT({ kind: 'Manga' })], col, illu);
    const res = await service.getMine('acc-me', q({ type: 'collections' }));
    expect(res.items.map((i) => i.id)).toEqual(['c1']);
    expect(res.items[0].kind).toBe('collection');
  });

  it('q matches an uncollected illustration\'s title', async () => {
    const illu = [{ id: 'i1', title: 'Carnet secret', image: null, createdAt: new Date('2024-05-01') }];
    build([PROJECT({ id: 'p1', title: 'Lames de Brume' })], [], illu);
    const res = await service.getMine('acc-me', q({ q: 'carnet' }));
    expect(res.items.map((i) => i.id)).toEqual(['i1']);
  });

  it('q filters both kinds by title, case-insensitive', async () => {
    build([PROJECT({ id: 'p1', title: 'Lames de Brume' })], [{ id: 'c1', slug: 's', title: 'Carnet', cover: null, count: 3 }]);
    const res = await service.getMine('acc-me', q({ q: 'brume' }));
    expect(res.items.map((i) => i.id)).toEqual(['p1']);
    expect(res.total).toBe(1);
  });

  it('status=en-cours includes en révision projects AND collections; en-pause/publies are exact', async () => {
    const projects = [
      PROJECT({ id: 'p-cours', status: 'en cours' }),
      PROJECT({ id: 'p-rev', status: 'en révision' }),
      PROJECT({ id: 'p-pause', status: 'en pause' }),
      PROJECT({ id: 'p-pub', status: 'publié' }),
    ];
    const col = [{ id: 'c1', slug: 's', title: 'C', cover: null, count: 1 }];

    // en-cours includes en révision series but EXCLUDES the null-status collection.
    build(projects, col);
    let res = await service.getMine('acc-me', q({ status: 'en-cours' }));
    expect(res.items.map((i) => i.id).sort()).toEqual(['p-cours', 'p-rev']);

    build(projects, col);
    res = await service.getMine('acc-me', q({ status: 'en-pause' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-pause']);

    build(projects, col);
    res = await service.getMine('acc-me', q({ status: 'publies' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-pub']);

    // tous includes the null-status collection.
    build(projects, col);
    res = await service.getMine('acc-me', q({ status: 'tous' }));
    expect(res.items.map((i) => i.id)).toContain('c1');
  });

  it('type filter maps param → project kind; collections filter isolates collection rows', async () => {
    const projects = [
      PROJECT({ id: 'p-manga', kind: 'Manga' }),
      PROJECT({ id: 'p-histoire', kind: 'Histoire' }),
    ];
    const col = [{ id: 'c1', slug: 's', title: 'C', cover: null, count: 1 }];

    build(projects, col);
    let res = await service.getMine('acc-me', q({ type: 'manga' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-manga']);

    build(projects, col);
    res = await service.getMine('acc-me', q({ type: 'histoire' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-histoire']);

    build(projects, col);
    res = await service.getMine('acc-me', q({ type: 'collections' }));
    expect(res.items.map((i) => i.id)).toEqual(['c1']);
  });

  it('type composes (AND) with status', async () => {
    const projects = [
      PROJECT({ id: 'p-manga-pause', kind: 'Manga', status: 'en pause' }),
      PROJECT({ id: 'p-manga-cours', kind: 'Manga', status: 'en cours' }),
      PROJECT({ id: 'p-histoire-pause', kind: 'Histoire', status: 'en pause' }),
    ];
    build(projects, []);
    const res = await service.getMine('acc-me', q({ type: 'manga', status: 'en-pause' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-manga-pause']);
  });

  it('paginates the merged set (page 2 slice + total across both kinds)', async () => {
    const projects = Array.from({ length: 21 }, (_, i) =>
      PROJECT({ id: `p${i}`, title: `P${i}`, createdAt: new Date(2024, 0, i + 1) }),
    );
    build(projects, [{ id: 'c1', slug: 's', title: 'C', cover: null, count: 1 }]);
    const res = await service.getMine('acc-me', q({ page: 2 }));
    expect(res.total).toBe(22);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(20);
    expect(res.items).toHaveLength(2);
  });

  it('derives summary from the UNFILTERED merged set (active/enRevision/next release min-future)', async () => {
    const future1 = new Date(Date.now() + 11 * 864e5);
    const future2 = new Date(Date.now() + 14 * 864e5);
    const projects = [
      PROJECT({ id: 'a', status: 'en cours', nextReleaseAt: future2 }),
      PROJECT({ id: 'b', status: 'en révision', nextReleaseAt: future1 }),
      PROJECT({ id: 'c', status: 'en pause', nextReleaseAt: null }),
      PROJECT({ id: 'd', status: 'publié', nextReleaseAt: new Date(Date.now() - 864e5) }),
    ];
    build(projects, [{ id: 'col', slug: 's', title: 'C', cover: null, count: 1 }]);
    // filter to a single card, but summary must still reflect the whole set
    const res = await service.getMine('acc-me', q({ status: 'publies' }));
    expect(res.summary).toEqual({
      active: 2, // en cours + en révision (the null-status collection is not "active")
      enRevision: 1,
      nextReleaseAt: future1.toISOString(),
    });
  });

  it('members: owner first with self:true, then accepted invitees with their profile role; pending/declined excluded', async () => {
    const project = PROJECT({
      id: 'p',
      invitations: [
        { status: 'accepted', toUser: { id: 'acc-yuki', displayName: 'Yuki', profile: { creatorRoles: ['dessinateur'] } } },
        { status: 'pending', toUser: { id: 'acc-x', displayName: 'X', profile: { creatorRoles: ['scenariste'] } } },
      ],
    });
    build([project], []);
    const res = await service.getMine('acc-me', q());
    expect(res.items[0].members).toEqual([
      { id: 'acc-me', name: 'Moi', role: 'scenariste', self: true },
      { id: 'acc-yuki', name: 'Yuki', role: 'dessinateur', self: false },
    ]);
  });

  it('scopes the project query to the caller (never another user\'s rows)', async () => {
    build([PROJECT()], []);
    await service.getMine('acc-me', q());
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'acc-me' } }),
    );
  });
});
