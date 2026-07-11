import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CardCollabController } from './card-collab.controller';
import { CardCollabService } from './card-collab.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('CardCollabController', () => {
  let controller: CardCollabController;
  let cards: Record<string, jest.Mock>;

  beforeEach(async () => {
    cards = {
      listLabels: jest.fn().mockResolvedValue([]),
      createLabel: jest.fn().mockResolvedValue({ id: 'lab-1' }),
      updateLabel: jest.fn().mockResolvedValue({ id: 'lab-1' }),
      deleteLabel: jest.fn().mockResolvedValue(undefined),
      addChecklistItem: jest.fn().mockResolvedValue({ id: 'ci-1' }),
      updateChecklistItem: jest.fn().mockResolvedValue({ id: 'ci-1' }),
      deleteChecklistItem: jest.fn().mockResolvedValue(undefined),
      addComment: jest.fn().mockResolvedValue({ id: 'cm-1' }),
      updateComment: jest.fn().mockResolvedValue({ id: 'cm-1' }),
      deleteComment: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardCollabController],
      providers: [{ provide: CardCollabService, useValue: cards }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CardCollabController>(CardCollabController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CardCollabController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  const req = { accountId: 'acc-me' } as never;

  it('GET projects/:slug/labels → listLabels', async () => {
    await controller.listLabels(req, 'lames-de-brume');
    expect(cards.listLabels).toHaveBeenCalledWith('acc-me', 'lames-de-brume');
  });

  it('POST projects/:slug/labels → createLabel', async () => {
    await controller.createLabel(req, 'lames-de-brume', { name: 'x', color: '#e8261c' } as never);
    expect(cards.createLabel).toHaveBeenCalledWith('acc-me', 'lames-de-brume', { name: 'x', color: '#e8261c' });
  });

  it('PATCH labels/:id → updateLabel', async () => {
    await controller.updateLabel(req, 'lab-1', { name: 'y' } as never);
    expect(cards.updateLabel).toHaveBeenCalledWith('acc-me', 'lab-1', { name: 'y' });
  });

  it('DELETE labels/:id → deleteLabel', async () => {
    await controller.deleteLabel(req, 'lab-1');
    expect(cards.deleteLabel).toHaveBeenCalledWith('acc-me', 'lab-1');
  });

  it('POST pages/:id/checklist → addChecklistItem', async () => {
    await controller.addChecklist(req, 'page-1', { text: 'a' } as never);
    expect(cards.addChecklistItem).toHaveBeenCalledWith('acc-me', 'page-1', { text: 'a' });
  });

  it('PATCH checklist/:itemId → updateChecklistItem', async () => {
    await controller.updateChecklist(req, 'ci-1', { done: true } as never);
    expect(cards.updateChecklistItem).toHaveBeenCalledWith('acc-me', 'ci-1', { done: true });
  });

  it('DELETE checklist/:itemId → deleteChecklistItem', async () => {
    await controller.deleteChecklist(req, 'ci-1');
    expect(cards.deleteChecklistItem).toHaveBeenCalledWith('acc-me', 'ci-1');
  });

  it('POST pages/:id/comments → addComment', async () => {
    await controller.addComment(req, 'page-1', { body: 'salut' } as never);
    expect(cards.addComment).toHaveBeenCalledWith('acc-me', 'page-1', { body: 'salut' });
  });

  it('PATCH comments/:id → updateComment', async () => {
    await controller.updateComment(req, 'cm-1', { body: 'edit' } as never);
    expect(cards.updateComment).toHaveBeenCalledWith('acc-me', 'cm-1', { body: 'edit' });
  });

  it('DELETE comments/:id → deleteComment', async () => {
    await controller.deleteComment(req, 'cm-1');
    expect(cards.deleteComment).toHaveBeenCalledWith('acc-me', 'cm-1');
  });
});
