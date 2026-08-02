import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PagesService } from './pages.service';
import { ProjectChatService } from './project-chat.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: { getMine: jest.Mock; getWorkspace: jest.Mock; updateInfo: jest.Mock };
  let pages: { createPage: jest.Mock };
  let chat: { list: jest.Mock; send: jest.Mock };

  beforeEach(async () => {
    service = {
      getMine: jest.fn().mockResolvedValue({ items: [] }),
      getWorkspace: jest.fn().mockResolvedValue({ id: 'p' }),
      updateInfo: jest.fn().mockResolvedValue({ title: 'x' }),
    };
    pages = { createPage: jest.fn().mockResolvedValue({ id: 'page-1' }) };
    chat = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null, conversationId: 'conv-1', canPost: true }),
      send: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: service },
        { provide: PagesService, useValue: pages },
        { provide: ProjectChatService, useValue: chat },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ProjectsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('passes the session accountId + parsed query to the service', async () => {
    await controller.mine({ accountId: 'acc-me' } as never, { scope: 'all', status: 'en-pause', type: 'manga', q: ' brume ', page: '2' });
    expect(service.getMine).toHaveBeenCalledWith('acc-me', { scope: 'all', status: 'en-pause', type: 'manga', q: 'brume', page: 2 });
  });

  it('defaults to the legacy picker query when no params are passed', async () => {
    await controller.mine({ accountId: 'acc-me' } as never, {});
    expect(service.getMine).toHaveBeenCalledWith('acc-me', { scope: 'projects', status: 'tous', type: 'tous', q: undefined, page: 1 });
  });

  // ── CS-2 workspace routes ──────────────────────────────────────────────────
  it('GET :slug → getWorkspace(accountId, slug)', async () => {
    await controller.workspace({ accountId: 'acc-me' } as never, 'lames-de-brume');
    expect(service.getWorkspace).toHaveBeenCalledWith('acc-me', 'lames-de-brume');
  });

  it('PATCH :slug → updateInfo(accountId, slug, body)', async () => {
    await controller.updateInfo({ accountId: 'acc-me' } as never, 'lames-de-brume', { title: 'Neuf' } as never);
    expect(service.updateInfo).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { title: 'Neuf' });
  });

  it('POST :slug/pages → pages.createPage(accountId, slug, body)', async () => {
    await controller.createPage({ accountId: 'acc-me' } as never, 'lames-de-brume', { stage: 'nemu' } as never);
    expect(pages.createPage).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { stage: 'nemu' });
  });

  // ── CS-8 discussion routes ─────────────────────────────────────────────────
  it('GET :slug/messages → chat.list(accountId, slug, { cursor, limit })', async () => {
    await controller.messages({ accountId: 'acc-me' } as never, 'lames-de-brume', 'msg-9', '10');
    expect(chat.list).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { cursor: 'msg-9', limit: 10 });
  });

  it('GET :slug/messages ignores a non-numeric limit (service default wins)', async () => {
    await controller.messages({ accountId: 'acc-me' } as never, 'lames-de-brume', undefined, 'abc');
    expect(chat.list).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { cursor: undefined, limit: undefined });
  });

  it('POST :slug/messages → chat.send(accountId, slug, body)', async () => {
    await controller.sendMessage({ accountId: 'acc-me' } as never, 'lames-de-brume', { text: 'Salut' } as never);
    expect(chat.send).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { text: 'Salut' });
  });
});
