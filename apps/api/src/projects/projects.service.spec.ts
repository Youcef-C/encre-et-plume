import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService, toProjectSummary } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsService } from '../collections/collections.service';
import { SlugService } from '../slug/slug.service';
import { MediaService } from '../media/media.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CallsService } from '../calls/calls.service';
import type { CreateProjectRequest } from '@encre-et-plume/shared';
import type { ParsedMyProjectsQuery } from './parse-my-projects-query';

const PROJECT = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  owner: { id: 'acc-me', displayName: 'Moi', profile: { creatorRoles: ['scenariste'] } },
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
      slug: 'lames-de-brume',
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

  const stubs = () => ({
    slug: { slugify: jest.fn((s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) },
    media: { getForOwner: jest.fn() },
    invitations: { create: jest.fn().mockResolvedValue({ results: [] }) },
    calls: { seedFromProject: jest.fn().mockResolvedValue(undefined) },
  });

  const build = (projects: unknown[], mine: unknown[] = [], illus: unknown[] = []) => {
    prisma = {
      project: { findMany: jest.fn().mockResolvedValue(projects) },
      account: { findUnique: jest.fn().mockResolvedValue(OWNER) },
      illustration: { findMany: jest.fn().mockResolvedValue(illus) },
    };
    collections = { getMine: jest.fn().mockResolvedValue(mine) };
    const s = stubs();
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      collections as unknown as CollectionsService,
      s.slug as unknown as SlugService,
      s.media as unknown as MediaService,
      s.invitations as unknown as InvitationsService,
      s.calls as unknown as CallsService,
    );
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
    expect(res).toEqual({
      items: [
        {
          id: 'proj-1',
          title: 'Lames de Brume',
          meta: 'Manga · Seinen · en cours',
          cover: null,
          // Additive fields so the CS-2 workspace switcher lists all owner manga/roman projects.
          slug: 'lames-de-brume',
          kind: 'project',
          type: 'Manga',
          status: 'en cours',
        },
      ],
    });
  });

  it('legacy: scope=projects behaves like the no-arg call', async () => {
    const res = await service.getMine('acc-me', q({ scope: 'projects' }));
    expect(collections.getMine).not.toHaveBeenCalled();
    expect(res.summary).toBeUndefined();
    expect(res.items[0]).toEqual({
      id: 'proj-1',
      title: 'Lames de Brume',
      meta: 'Manga · Seinen · en cours',
      cover: null,
      slug: 'lames-de-brume',
      kind: 'project',
      type: 'Manga',
      status: 'en cours',
    });
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

  it('queries the caller\'s owned AND member (WorkCreator) projects', async () => {
    build([PROJECT()], []);
    await service.getMine('acc-me', q());
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ ownerId: 'acc-me' }, { work: { creators: { some: { accountId: 'acc-me' } } } }] },
      }),
    );
  });

  // ── CS-12 bugfix: member projects appear, ownership indicator ─────────────
  it('an owned project reports isOwner:true', async () => {
    build([PROJECT()], []);
    const res = await service.getMine('acc-me', q());
    expect(res.items[0].isOwner).toBe(true);
  });

  it('a member-but-not-owner project appears with isOwner:false, the real owner + caller(self) as members', async () => {
    const member = PROJECT({
      id: 'p-member',
      ownerId: 'acc-owner',
      owner: { id: 'acc-owner', displayName: 'Aki', profile: { creatorRoles: ['dessinateur'] } },
      invitations: [
        { status: 'accepted', toUser: { id: 'acc-me', displayName: 'Moi', profile: { creatorRoles: ['scenariste'] } } },
      ],
    });
    build([member], []);
    const res = await service.getMine('acc-me', q());
    const row = res.items.find((i) => i.id === 'p-member')!;
    expect(row.isOwner).toBe(false);
    expect(row.members).toEqual([
      { id: 'acc-owner', name: 'Aki', role: 'dessinateur', self: false },
      { id: 'acc-me', name: 'Moi', role: 'scenariste', self: true },
    ]);
  });

  it('type=collaborations returns only member (isOwner:false) projects, not owned ones', async () => {
    const owned = PROJECT({ id: 'p-owned' }); // ownerId acc-me
    const member = PROJECT({
      id: 'p-member',
      ownerId: 'acc-owner',
      owner: { id: 'acc-owner', displayName: 'Aki', profile: { creatorRoles: ['dessinateur'] } },
      invitations: [
        { status: 'accepted', toUser: { id: 'acc-me', displayName: 'Moi', profile: { creatorRoles: ['scenariste'] } } },
      ],
    });
    build([owned, member], []);
    const res = await service.getMine('acc-me', q({ type: 'collaborations' }));
    expect(res.items.map((i) => i.id)).toEqual(['p-member']);
  });

  it('dedupes to one row when the caller is both owner and WorkCreator (no double row)', async () => {
    const p = PROJECT({ id: 'p-dup' });
    build([p, p], []); // OR would never duplicate in SQL, but guard against it anyway
    const res = await service.getMine('acc-me', q());
    expect(res.items.filter((i) => i.id === 'p-dup')).toHaveLength(1);
  });

  it('summary counts the merged owned+member set once', async () => {
    const owned = PROJECT({ id: 'p-own', status: 'en cours' });
    const member = PROJECT({
      id: 'p-mem',
      ownerId: 'acc-owner',
      owner: { id: 'acc-owner', displayName: 'Aki', profile: { creatorRoles: ['dessinateur'] } },
      status: 'en révision',
    });
    build([owned, member], []);
    const res = await service.getMine('acc-me', q());
    expect(res.summary).toEqual({ active: 2, enRevision: 1, nextReleaseAt: null });
  });

  // ── CS-1 §11: published one-shot → "terminé" ─────────────────────────────
  it('a published one-shot (linked Work) reads status "terminé"; unpublished stays stored', async () => {
    const published = PROJECT({ id: 'p-oneshot', status: 'en cours', work: { format: 'One-shot', publishedAt: new Date() } });
    const draft = PROJECT({ id: 'p-draft', status: 'en cours', work: { format: 'One-shot', publishedAt: null } });
    const serie = PROJECT({ id: 'p-serie', status: 'en cours', work: { format: 'Manga', publishedAt: new Date() } });
    build([published, draft, serie], []);
    const res = await service.getMine('acc-me', q());
    expect(res.items.find((i) => i.id === 'p-oneshot')!.status).toBe('terminé');
    expect(res.items.find((i) => i.id === 'p-draft')!.status).toBe('en cours');
    expect(res.items.find((i) => i.id === 'p-serie')!.status).toBe('en cours');
  });

  it('status=publies matches both "publié" and a one-shot "terminé"', async () => {
    const pub = PROJECT({ id: 'p-pub', status: 'publié' });
    const done = PROJECT({ id: 'p-done', status: 'en cours', work: { format: 'One-shot', publishedAt: new Date() } });
    const cours = PROJECT({ id: 'p-cours', status: 'en cours' });
    build([pub, done, cours], []);
    const res = await service.getMine('acc-me', q({ status: 'publies' }));
    expect(res.items.map((i) => i.id).sort()).toEqual(['p-done', 'p-pub']);
  });
});

// ── CS-1: POST /projects create (transaction + seeding) ──────────────────────
describe('ProjectsService.create', () => {
  let service: ProjectsService;
  let prisma: Record<string, jest.Mock | Record<string, jest.Mock>>;
  let collections: { resolveContestId: jest.Mock };
  let media: { getForOwner: jest.Mock };
  let invitations: { create: jest.Mock };
  let calls: { seedFromProject: jest.Mock };

  const OWNER_ACC = { displayName: 'Moi', profile: { creatorRoles: ['dessinateur'] } };

  beforeEach(() => {
    prisma = {
      account: { findUnique: jest.fn().mockResolvedValue(OWNER_ACC) },
      work: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'work-1', slug: data.slug })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      project: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'proj-1', slug: data.slug })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      workCreator: { create: jest.fn().mockResolvedValue({}) },
      fundingGoal: { create: jest.fn().mockResolvedValue({}) },
      conversation: { create: jest.fn().mockResolvedValue({ id: 'conv-1' }) },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as any;
    collections = { resolveContestId: jest.fn(async (id?: string) => id ?? null) };
    media = { getForOwner: jest.fn() };
    invitations = { create: jest.fn().mockResolvedValue({ results: [] }) };
    calls = { seedFromProject: jest.fn().mockResolvedValue(undefined) };
    const slug = { slugify: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      collections as unknown as CollectionsService,
      slug as unknown as SlugService,
      media as unknown as MediaService,
      invitations as unknown as InvitationsService,
      calls as unknown as CallsService,
    );
  });

  const dto = (o: Partial<CreateProjectRequest> = {}): CreateProjectRequest => ({ type: 'manga', title: 'Lames de Brume', ...o });

  const workData = () => (prisma.work as Record<string, jest.Mock>).create.mock.calls[0][0].data;
  const projectData = () => (prisma.project as Record<string, jest.Mock>).create.mock.calls[0][0].data;

  it('rejects an empty title', async () => {
    await expect(service.create('acc-me', dto({ title: '   ' }))).rejects.toThrow(BadRequestException);
  });

  it('creates Work + Project in one transaction, shares one slug, returns {id,slug,workId,title}', async () => {
    const res = await service.create('acc-me', dto({ title: 'Lames de Brume' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(workData().slug).toBe('lames-de-brume');
    expect(projectData().slug).toBe('lames-de-brume');
    expect(projectData().workId).toBe('work-1');
    expect(res).toEqual({ id: 'proj-1', slug: 'lames-de-brume', workId: 'work-1', title: 'Lames de Brume' });
  });

  it('suffixes the slug when it collides in Work OR Project', async () => {
    (prisma.work as Record<string, jest.Mock>).findMany.mockResolvedValue([{ slug: 'lames-de-brume' }]);
    (prisma.project as Record<string, jest.Mock>).findMany.mockResolvedValue([{ slug: 'lames-de-brume-2' }]);
    await service.create('acc-me', dto());
    expect(workData().slug).toBe('lames-de-brume-3');
  });

  it.each([
    ['manga', 'serie', 'Manga', 'Manga'],
    ['story', 'serie', 'Roman', 'Histoire (illustrée)'],
    ['manga', 'oneshot', 'One-shot', 'Manga'],
    ['story', 'oneshot', 'One-shot', 'Histoire (illustrée)'],
  ])('maps type=%s format=%s → Work.format %s, Project.kind %s', async (type, format, wf, kind) => {
    await service.create('acc-me', dto({ type: type as any, format: format as any }));
    expect(workData().format).toBe(wf);
    expect(projectData().kind).toBe(kind);
  });

  it('maps genre/themes F-20 ids → fr labels; Work.genre defaults, Project.genre null when none', async () => {
    await service.create('acc-me', dto({ genre: 'seinen', themes: ['action', 'adventure'] }));
    expect(workData().genre).toBe('Seinen');
    expect(workData().themes).toEqual(['Action', 'Aventure']);
    expect(projectData().genre).toBe('Seinen');
  });

  it('defaults Work.genre and nulls Project.genre when no genre given', async () => {
    await service.create('acc-me', dto());
    expect(workData().genre).toBe('Art');
    expect(projectData().genre).toBeNull();
  });

  it('rejects an unknown genre id (400)', async () => {
    await expect(service.create('acc-me', dto({ genre: 'not-a-genre' }))).rejects.toThrow(BadRequestException);
  });

  it('normalizes hashtags, persists audienceRating, leaves the Work unpublished', async () => {
    await service.create('acc-me', dto({ hashtags: ['Thriller', 'thriller', 'noir'], audienceRating: '16+' }));
    expect(workData().hashtags).toEqual(['thriller', 'noir']);
    expect(workData().audienceRating).toBe('16+');
    expect(workData().publishedAt).toBeNull();
  });

  it('adds the owner as the order-0 WorkCreator with the mapped role (first creator role)', async () => {
    await service.create('acc-me', dto());
    expect((prisma.workCreator as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workId: 'work-1', accountId: 'acc-me', role: 'dessinateur', order: 0 }) }),
    );
  });

  // R2-1a (review BLK-3): the project's Discussion thread is provisioned WITH the project, inside the
  // same transaction — not lazily on the first Discussion-tab visit. Until this, a brand new project
  // showed no « Projet · … » row in anyone's Messages widget.
  it('R2-1a: provisions the project conversation with the owner as its participant, in the same transaction', async () => {
    await service.create('acc-me', dto({ title: 'Lames de Brume' }));
    const conv = (prisma.conversation as Record<string, jest.Mock>).create;
    expect(conv).toHaveBeenCalledTimes(1);
    expect(conv.mock.calls[0][0].data).toMatchObject({
      type: 'group',
      projectId: 'proj-1',
      name: 'Lames de Brume',
      createdBy: 'acc-me',
      participants: { create: [{ accountId: 'acc-me' }] },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('CS-10: the owner row is the group leader holding the whole revenue split', async () => {
    await service.create('acc-me', dto());
    expect((prisma.workCreator as Record<string, jest.Mock>).create.mock.calls[0][0].data).toMatchObject({
      groupRole: 'leader',
      sharePct: 100,
    });
  });

  it('defaults the owner WorkCreator role to scenariste when the profile has no creator roles', async () => {
    (prisma.account as Record<string, jest.Mock>).findUnique.mockResolvedValue({ displayName: 'Moi', profile: { creatorRoles: [] } });
    await service.create('acc-me', dto());
    expect((prisma.workCreator as Record<string, jest.Mock>).create.mock.calls[0][0].data.role).toBe('scenariste');
  });

  it('creates FundingGoal rows for goals[] and stores tiers/dons/split in Work.soutien', async () => {
    await service.create('acc-me', dto({
      tiers: [{ name: 'Bronze', priceCents: 300 }],
      allowDonations: true,
      goals: [{ title: 'Impression', targetCents: 50000 }],
      revenueSplit: [{ accountId: 'acc-me', pct: 100 }],
    }));
    expect(workData().soutien).toEqual({
      tiers: [{ name: 'Bronze', priceCents: 300 }],
      allowDonations: true,
      revenueSplit: [{ accountId: 'acc-me', pct: 100 }],
    });
    expect((prisma.fundingGoal as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workId: 'work-1', title: 'Impression', targetCents: 50000, order: 0 }) }),
    );
  });

  it('rejects a revenueSplit that does not total 100 %', async () => {
    await expect(
      service.create('acc-me', dto({ revenueSplit: [{ accountId: 'acc-me', pct: 60 }] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a revenueSplit accountId outside owner + invites', async () => {
    await expect(
      service.create('acc-me', dto({ invites: ['acc-a'], revenueSplit: [{ accountId: 'stranger', pct: 100 }] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an empty revenueSplit (solo)', async () => {
    await expect(service.create('acc-me', dto())).resolves.toBeDefined();
  });

  it('validates contestId via the shared resolver and persists it on the Work', async () => {
    await service.create('acc-me', dto({ contestId: 'c1' }));
    expect(collections.resolveContestId).toHaveBeenCalledWith('c1');
    expect(workData().contestId).toBe('c1');
  });

  it('propagates a closed/unknown contest 400 from the resolver', async () => {
    collections.resolveContestId.mockRejectedValue(new BadRequestException('Concours introuvable ou clos'));
    await expect(service.create('acc-me', dto({ contestId: 'closed' }))).rejects.toThrow(BadRequestException);
  });

  it('resolves an owned ready cover media → Work.coverImage and Project.cover', async () => {
    media.getForOwner.mockResolvedValue({ kind: 'cover', status: 'ready', variants: { web: 'https://cdn/x.webp' } });
    await service.create('acc-me', dto({ cover: { mediaId: 'm1' } }));
    expect(media.getForOwner).toHaveBeenCalledWith('acc-me', 'm1');
    expect(workData().coverImage).toBe('https://cdn/x.webp');
    expect(projectData().cover).toBe('https://cdn/x.webp');
  });

  it('rejects a cover media of the wrong kind', async () => {
    media.getForOwner.mockResolvedValue({ kind: 'illustration', status: 'ready', variants: { web: 'x' } });
    await expect(service.create('acc-me', dto({ cover: { mediaId: 'm1' } }))).rejects.toThrow(BadRequestException);
  });

  it('fans out MC-3 invitations once with {toUsers, projectId}', async () => {
    await service.create('acc-me', dto({ invites: ['acc-a', 'acc-b'] }));
    expect(invitations.create).toHaveBeenCalledTimes(1);
    expect(invitations.create).toHaveBeenCalledWith('acc-me', { toUsers: ['acc-a', 'acc-b'], projectId: 'proj-1' });
  });

  it('seeds ONE MC-4 call from seeking counts (seats + genre ids)', async () => {
    await service.create('acc-me', dto({ seeking: { scenariste: 1, dessinateur: 2 }, genre: 'seinen', themes: ['action'], synopsis: 'Un récit.' }));
    expect(calls.seedFromProject).toHaveBeenCalledTimes(1);
    expect(calls.seedFromProject).toHaveBeenCalledWith('acc-me', {
      projectId: 'proj-1',
      title: 'Lames de Brume',
      seats: { scenariste: 1, dessinateur: 2 },
      genres: ['seinen', 'action'],
      description: 'Un récit.',
    });
  });

  it('seeds no call when all seeking counts are zero/absent', async () => {
    await service.create('acc-me', dto({ seeking: { scenariste: 0, dessinateur: 0 } }));
    expect(calls.seedFromProject).not.toHaveBeenCalled();
  });

  it('a side-effect failure does not roll back / fail the create', async () => {
    invitations.create.mockRejectedValue(new Error('notif down'));
    const res = await service.create('acc-me', dto({ invites: ['acc-a'] }));
    expect(res.id).toBe('proj-1');
  });
});

// ── CS-2: GET /projects/:slug workspace + PATCH info ──────────────────────────
describe('ProjectsService workspace (CS-2)', () => {
  let service: ProjectsService;
  let prisma: any;
  let media: { getForOwner: jest.Mock };

  // Owner acc-me + workCreator acc-yuki; a linked Work with chapters, creators, reviews.
  const WORKSPACE = (o: Record<string, unknown> = {}) => ({
    id: 'proj-1',
    ownerId: 'acc-me',
    slug: 'lames-de-brume',
    cover: null,
    visibility: 'prive',
    collabOpen: false,
    workId: 'work-1',
    work: {
      id: 'work-1',
      slug: 'lames-de-brume',
      title: 'Lames de Brume',
      synopsis: 'Un récit.',
      hashtags: ['thriller'],
      coverImage: null,
      creators: [
        // CS-10 group columns ride along on the workspace query — viewer.canWrite is derived from them.
        { accountId: 'acc-me', role: 'scenariste', order: 0, groupRole: 'leader', permissions: [], account: { id: 'acc-me', displayName: 'Moi', avatar: null, profile: { creatorRoles: ['scenariste', 'dessinateur'] } } },
        { accountId: 'acc-yuki', role: 'dessinateur', order: 1, groupRole: 'member', permissions: ['ecriture', 'corrections'], account: { id: 'acc-yuki', displayName: 'Yuki', avatar: 'y.jpg', profile: { creatorRoles: ['dessinateur'] } } },
      ],
      chapters: [
        { id: 'ch-0', number: 0, title: 'Prologue', status: 'published', targetPages: 2 },
        { id: 'ch-1', number: 1, title: null, status: 'draft', targetPages: 20 },
      ],
      reviews: [
        { id: 'r1', authorName: 'Lea', storyRating: 4, artRating: 5, text: 'super', hidden: false, createdAt: new Date('2024-03-02') },
        { id: 'r2', authorName: 'Hugo', storyRating: 2, artRating: 3, text: 'secret', hidden: true, createdAt: new Date('2024-03-01') },
      ],
    },
    pages: [
      { id: 'page-1', chapterId: 'ch-0', title: 'Page 1', stage: 'scenario', version: 1, fileTags: ['scenario'], linkedFileIds: [] },
    ],
    labels: [{ id: 'lab-1', name: 'À revoir', color: '#e8261c', createdAt: new Date('2024-01-01') }],
    ...o,
  });

  const build = (row: unknown = WORKSPACE()) => {
    prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({}),
      },
      work: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : (ops as (tx: unknown) => Promise<unknown>)(prisma),
      ),
    };
    media = { getForOwner: jest.fn() };
    const stub = () => ({}) as never;
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      stub() as unknown as CollectionsService,
      stub() as unknown as SlugService,
      media as unknown as MediaService,
      stub() as unknown as InvitationsService,
      stub() as unknown as CallsService,
    );
  };

  beforeEach(() => build());

  // ── getWorkspace ───────────────────────────────────────────────────────────
  describe('getWorkspace', () => {
    // R2-8b — the Tableau's chip row draws a progress bar, so the workspace payload carries the same
    // derived value as the Chapitres tab. Derived in-memory from the pages already loaded (no N+1).
    it('carries a targetPages / progressPct for EVERY chapter (R3-2 — never null)', async () => {
      const res = await service.getWorkspace('acc-me', 'lames-de-brume');
      // ch-0: 1 linked card, not at the terminal stage → 0 done of 2 planned.
      expect(res.chapters[0]).toMatchObject({ targetPages: 2, progressPct: 0 });
      // ch-1: nobody planned it by hand, so it carries the default 20 — still a real percentage.
      expect(res.chapters[1]).toMatchObject({ targetPages: 20, progressPct: 0 });
    });

    // DB pass 2026-08-02 — the stored `Chapter.plancheCount` column is gone: nothing in apps/api ever
    // wrote it, so it stayed at its seeded value forever. In the WORKSPACE the number means "board
    // cards attached to this chapter" (the same thing CS-7's Chapitres tab counts), NOT the reader's
    // `Planche` rows — so it is derived from `project.pages`, already loaded by the same query.
    it('derives plancheCount from the board cards already loaded (no extra query)', async () => {
      const res = await service.getWorkspace('acc-me', 'lames-de-brume');
      // ch-0 owns page-1; ch-1 owns nothing.
      expect(res.chapters.map((c) => c.plancheCount)).toEqual([1, 0]);
      expect(prisma.project.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns the full payload for a member: ordered members/chapters, pages, review summary, hidden text blanked', async () => {
      const res = await service.getWorkspace('acc-me', 'lames-de-brume');
      expect(res.title).toBe('Lames de Brume');
      expect(res.workSlug).toBe('lames-de-brume');
      expect(res.members.map((m) => m.accountId)).toEqual(['acc-me', 'acc-yuki']);
      // Both profile roles → both icons for acc-me; single role for acc-yuki.
      expect(res.members.map((m) => m.roles)).toEqual([['scenariste', 'dessinateur'], ['dessinateur']]);
      expect(res.chapters.map((c) => c.number)).toEqual([0, 1]);
      expect(res.pages).toHaveLength(1);
      // summary over all reviews: story (4+2)/2=3, art (5+3)/2=4, overall ((4.5)+(2.5))/2=3.5, count 2
      expect(res.reviews.summary).toEqual({ overall: 3.5, story: 3, art: 4, count: 2 });
      const hidden = res.reviews.items.find((r) => r.hidden)!;
      expect(hidden.text).toBe('');
      expect(res.viewer).toEqual({ isMember: true, isOwner: true, canWrite: true, canManage: true });
      // CS-2 card-modal: the project label palette rides along for the filter row + modal picker.
      expect(res.labels).toEqual([{ id: 'lab-1', name: 'À revoir', color: '#e8261c' }]);
    });

    it('a non-owner member sees isMember:true, isOwner:false', async () => {
      const res = await service.getWorkspace('acc-yuki', 'lames-de-brume');
      // acc-yuki is a plain `member` row: holds « Écriture » but no leadership → canManage false.
      expect(res.viewer).toEqual({ isMember: true, isOwner: false, canWrite: true, canManage: false });
    });

    it('a non-member on a PUBLIC project gets a read-only payload (isMember:false)', async () => {
      build(WORKSPACE({ visibility: 'public' }));
      const res = await service.getWorkspace('stranger', 'lames-de-brume');
      expect(res.viewer).toEqual({ isMember: false, isOwner: false, canWrite: false, canManage: false });
    });

    it('a non-member on a PRIVE project gets 404 (no existence leak)', async () => {
      await expect(service.getWorkspace('stranger', 'lames-de-brume')).rejects.toThrow(NotFoundException);
    });

    it('a non-member on an INVITATION project gets 404', async () => {
      build(WORKSPACE({ visibility: 'invitation' }));
      await expect(service.getWorkspace('stranger', 'lames-de-brume')).rejects.toThrow(NotFoundException);
    });

    it('unknown slug → 404', async () => {
      build(null);
      await expect(service.getWorkspace('acc-me', 'nope')).rejects.toThrow(NotFoundException);
    });

    // CS-20 A7 — the handoff pin's `stale` is derived from the ONE workspace read. The prisma stub
    // exposes no `asset` / `assetVersion` model at all, so a per-card version lookup would throw
    // here rather than quietly ship an N+1 to production.
    it('derives every card\'s handoff pin from the single workspace read (no per-card version lookup)', async () => {
      build(
        WORKSPACE({
          pages: [
            { id: 'page-1', chapterId: 'ch-0', title: 'Page 1', stage: 'nemu', fileTags: [], linkedFileIds: [], drawnAgainstVersion: 2, drawnAgainstAsset: { id: 'as-1', currentVersion: 5 } },
            { id: 'page-2', chapterId: 'ch-0', title: 'Page 2', stage: 'nemu', fileTags: [], linkedFileIds: [], drawnAgainstVersion: 5, drawnAgainstAsset: { id: 'as-1', currentVersion: 5 } },
            { id: 'page-3', chapterId: 'ch-0', title: 'Page 3', stage: 'scenario', fileTags: [], linkedFileIds: [] },
          ],
        }),
      );
      const res = await service.getWorkspace('acc-me', 'lames-de-brume');
      expect(res.pages.map((p) => p.handoff)).toEqual([
        { assetId: 'as-1', version: 2, headVersion: 5, stale: true },
        { assetId: 'as-1', version: 5, headVersion: 5, stale: false },
        null,
      ]);
      expect(prisma.project.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.asset).toBeUndefined();
      expect(prisma.assetVersion).toBeUndefined();
      // …and the pinned head rides along as a nested select on the same read.
      expect(prisma.project.findUnique.mock.calls[0][0].include.pages.include.drawnAgainstAsset).toEqual({
        select: { id: true, currentVersion: true },
      });
    });
  });

  // ── updateInfo ─────────────────────────────────────────────────────────────
  describe('updateInfo', () => {
    it('writes title to BOTH Project and Work', async () => {
      const res = await service.updateInfo('acc-me', 'lames-de-brume', { title: '  Nouveau titre  ' });
      expect(prisma.work.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Nouveau titre' }) }));
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Nouveau titre' }) }));
      expect(res.title).toBe('Nouveau titre');
    });

    it('rejects an empty title (400 "Un titre est requis")', async () => {
      await expect(service.updateInfo('acc-me', 'lames-de-brume', { title: '   ' })).rejects.toThrow('Un titre est requis');
    });

    it('writes synopsis to Work', async () => {
      await service.updateInfo('acc-me', 'lames-de-brume', { synopsis: 'Nouvelle intrigue.' });
      expect(prisma.work.update).toHaveBeenCalledWith(expect.objectContaining({ data: { synopsis: 'Nouvelle intrigue.' } }));
    });

    it('normalizes hashtags → Work.hashtags', async () => {
      const res = await service.updateInfo('acc-me', 'lames-de-brume', { hashtags: ['#Noir', 'noir', 'Thriller'] });
      expect(prisma.work.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hashtags: ['noir', 'thriller'] } }));
      expect(res.hashtags).toEqual(['noir', 'thriller']);
    });

    it('writes collabOpen → Project.collabOpen', async () => {
      const res = await service.updateInfo('acc-me', 'lames-de-brume', { collabOpen: true });
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { collabOpen: true } }));
      expect(res.collabOpen).toBe(true);
    });

    it('validates a cover media (kind/ready/owner) and writes the URL to Work.coverImage AND Project.cover', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'cover', status: 'ready', variants: { web: 'https://cdn/c.webp' } });
      const res = await service.updateInfo('acc-me', 'lames-de-brume', { cover: { mediaId: 'm1' } });
      expect(media.getForOwner).toHaveBeenCalledWith('acc-me', 'm1');
      expect(prisma.work.update).toHaveBeenCalledWith(expect.objectContaining({ data: { coverImage: 'https://cdn/c.webp' } }));
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { cover: 'https://cdn/c.webp' } }));
      expect(res.cover).toBe('https://cdn/c.webp');
    });

    it('rejects a cover media of the wrong kind (400)', async () => {
      media.getForOwner.mockResolvedValue({ kind: 'illustration', status: 'ready', variants: { web: 'x' } });
      await expect(service.updateInfo('acc-me', 'lames-de-brume', { cover: { mediaId: 'm1' } })).rejects.toThrow(BadRequestException);
    });

    it('cover:null clears both Work.coverImage and Project.cover', async () => {
      const res = await service.updateInfo('acc-me', 'lames-de-brume', { cover: null });
      expect(prisma.work.update).toHaveBeenCalledWith(expect.objectContaining({ data: { coverImage: null } }));
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { cover: null } }));
      expect(res.cover).toBeNull();
    });

    it('403 for a non-member on a public project', async () => {
      build(WORKSPACE({ visibility: 'public' }));
      await expect(service.updateInfo('stranger', 'lames-de-brume', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('404 for a non-member on a non-public project (no leak)', async () => {
      await expect(service.updateInfo('stranger', 'lames-de-brume', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    // CS-10 D-2 (inferred extension): PATCH /projects/:slug edits project content, so it resolves
    // through the WRITE resolver. Every case above runs as `acc-me`, the OWNER, who short-circuits the
    // permission check — the exact blind spot that hid B-4's ungated routes behind 81 green tests.
    describe('CS-10 — « Écriture » gate', () => {
      const member = (accountId: string, groupRole: string, permissions: string[]) => ({
        accountId,
        groupRole,
        permissions,
        role: 'scenariste',
        order: 0,
        account: { id: accountId, displayName: accountId, avatar: null, profile: null },
      });
      const ROSTER = [
        member('acc-me', 'leader', []),
        member('acc-writer', 'member', ['ecriture']),
        member('acc-reader', 'member', ['corrections']), // « Écriture » explicitly OFF
        member('acc-co', 'coleader', []),
      ];
      const withRoster = () => build(WORKSPACE({ work: { ...WORKSPACE().work, creators: ROSTER } }));

      it.each([
        ['the owner', 'acc-me'],
        ['a co-leader', 'acc-co'],
        ['a member holding « Écriture »', 'acc-writer'],
      ])('allows %s', async (_who, accountId) => {
        withRoster();
        await expect(service.updateInfo(accountId, 'lames-de-brume', { title: 'Nouveau' })).resolves.toBeDefined();
      });

      it('refuses a member WITHOUT « Écriture » (403) and persists nothing', async () => {
        withRoster();
        await expect(service.updateInfo('acc-reader', 'lames-de-brume', { title: 'Nouveau' })).rejects.toThrow(ForbiddenException);
        expect(prisma.work.update).not.toHaveBeenCalled();
        expect(prisma.project.update).not.toHaveBeenCalled();
      });

      it('resolveMemberProject loads groupRole + permissions (a resolver that cannot see them cannot gate)', async () => {
        withRoster();
        await service.updateInfo('acc-me', 'lames-de-brume', { title: 'Nouveau' });
        expect(prisma.project.findUnique.mock.calls[0][0].include.work.include.creators.select).toMatchObject({
          accountId: true,
          groupRole: true,
          permissions: true,
        });
      });

      it('viewer.canManage is true for a co-leader (canManageProject, not isGroupLeader)', async () => {
        withRoster();
        const res = await service.getWorkspace('acc-co', 'lames-de-brume');
        expect(res.viewer.canManage).toBe(true);
      });
    });
  });
});
