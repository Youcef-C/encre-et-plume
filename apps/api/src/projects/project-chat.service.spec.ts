import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectChatService } from './project-chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MessagesService } from '../messaging/messages.service';

// Owner acc-me, co-author acc-yuki. `visibility` drives the non-member 403/404 matrix.
const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  title: 'Lames de brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: {
    creators: [
      { accountId: 'acc-me', groupRole: 'leader', permissions: ['ecriture'] },
      { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture'] },
    ],
  },
  ...o,
});

const PAGE = { items: [], nextCursor: null };

function uniqueViolation() {
  return Object.assign(new Error('unique'), { code: 'P2002' });
}

function build(over: { project?: unknown; conversation?: unknown } = {}) {
  const prisma = {
    project: { findUnique: jest.fn().mockResolvedValue(over.project ?? PROJECT()) },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(over.conversation ?? null),
      create: jest.fn().mockResolvedValue({ id: 'conv-proj-1' }),
    },
    conversationParticipant: {
      findMany: jest.fn().mockResolvedValue([{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const messages = {
    getMessages: jest.fn().mockResolvedValue(PAGE),
    sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  };
  const service = new ProjectChatService(
    prisma as unknown as PrismaService,
    messages as unknown as MessagesService,
  );
  return { service, prisma, messages };
}

describe('ProjectChatService (CS-8)', () => {
  // B5 — one thread per project: provisioned once, then reused.
  it('provisions ONE conversation on first access', async () => {
    const { service, prisma } = build();
    const page = await service.list('acc-me', 'lames-de-brume', {});

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create.mock.calls[0][0].data).toMatchObject({
      type: 'group',
      projectId: 'proj-1',
      createdBy: 'acc-me',
    });
    expect(page.conversationId).toBe('conv-proj-1');
    expect(page.canPost).toBe(true);
  });

  it('reuses the existing conversation on the second access', async () => {
    const { service, prisma } = build({ conversation: { id: 'conv-existing' } });
    const page = await service.list('acc-yuki', 'lames-de-brume', {});
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(page.conversationId).toBe('conv-existing');
  });

  // The @@unique([projectId]) backstop: the loser of a concurrent double-open adopts the winner's row.
  it('a concurrent double-open does not create a second thread', async () => {
    const { service, prisma } = build();
    prisma.conversation.create.mockRejectedValue(uniqueViolation());
    prisma.conversation.findUnique
      .mockResolvedValueOnce(null) // my read: nothing yet
      .mockResolvedValueOnce({ id: 'conv-winner' }); // after the violation: the winner's row

    const page = await service.list('acc-me', 'lames-de-brume', {});
    expect(page.conversationId).toBe('conv-winner');
  });

  it('adds a newly joined member as a participant', async () => {
    const { service, prisma } = build({ conversation: { id: 'conv-1' } });
    prisma.conversationParticipant.findMany.mockResolvedValue([{ accountId: 'acc-me' }]);

    await service.list('acc-me', 'lames-de-brume', {});
    expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ conversationId: 'conv-1', accountId: 'acc-yuki' }] }),
    );
  });

  it('removes a revoked member from the thread', async () => {
    const { service, prisma } = build({ conversation: { id: 'conv-1' } });
    prisma.conversationParticipant.findMany.mockResolvedValue([
      { accountId: 'acc-me' },
      { accountId: 'acc-yuki' },
      { accountId: 'acc-revoked' },
    ]);

    await service.list('acc-me', 'lames-de-brume', {});
    expect(prisma.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', accountId: { in: ['acc-revoked'] } },
    });
  });

  it('writes nothing when the participants already equal the member set', async () => {
    const { service, prisma } = build({ conversation: { id: 'conv-1' } });
    await service.list('acc-me', 'lames-de-brume', {});
    expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    expect(prisma.conversationParticipant.deleteMany).not.toHaveBeenCalled();
  });

  // B6 — the workspace 404/403 matrix, and nothing more.
  it('a non-member of a private project gets a 404 (no existence leak)', async () => {
    const { service, prisma } = build();
    await expect(service.list('acc-stranger', 'lames-de-brume', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('a non-member of a public project gets a 403', async () => {
    const { service } = build({ project: PROJECT({ visibility: 'public' }) });
    await expect(service.list('acc-stranger', 'lames-de-brume', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an unknown project is a 404', async () => {
    const { service, prisma } = build();
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.list('acc-me', 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  // D-5 — AD-11's oversight read is deliberately NOT built: a maintainer/admin is a stranger here.
  it('a maintainer gets NO special read access (D-5, AD-11 out of scope)', async () => {
    const { service } = build();
    await expect(service.list('acc-maintainer', 'lames-de-brume', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('history is delegated to MessagesService with the cursor', async () => {
    const { service, messages } = build({ conversation: { id: 'conv-1' } });
    await service.list('acc-me', 'lames-de-brume', { cursor: 'msg-9', limit: 10 });
    expect(messages.getMessages).toHaveBeenCalledWith('acc-me', 'conv-1', { cursor: 'msg-9', limit: 10 });
  });

  // B3/B7 — send is MC-9's sendMessage (validation, attachments, realtime, F-5), never re-implemented.
  it('send delegates to MessagesService.sendMessage', async () => {
    const { service, messages } = build({ conversation: { id: 'conv-1' } });
    const msg = await service.send('acc-me', 'lames-de-brume', {
      text: 'Le nemu est prêt',
      attachments: [{ mediaId: 'media-1' }],
    });
    expect(messages.sendMessage).toHaveBeenCalledWith('acc-me', 'conv-1', {
      body: 'Le nemu est prêt',
      attachments: [{ mediaId: 'media-1' }],
    });
    expect(msg).toEqual({ id: 'msg-1' });
  });

  // MC-15: a quote is passed straight through — "same conversation or 400" is sendMessage's rule,
  // so the project surface cannot drift from the widget or the salon.
  it('send forwards replyToId to MessagesService.sendMessage', async () => {
    const { service, messages } = build({ conversation: { id: 'conv-1' } });
    await service.send('acc-me', 'lames-de-brume', { text: 'oui', replyToId: 'msg-9' });
    expect(messages.sendMessage).toHaveBeenCalledWith('acc-me', 'conv-1', {
      body: 'oui',
      replyToId: 'msg-9',
    });
  });

  it('send propagates the "text or attachment required" 400 from sendMessage', async () => {
    const { service, messages } = build({ conversation: { id: 'conv-1' } });
    messages.sendMessage.mockRejectedValue(new Error('Écrivez un message ou joignez un fichier.'));
    await expect(service.send('acc-me', 'lames-de-brume', {})).rejects.toThrow(
      'Écrivez un message ou joignez un fichier.',
    );
  });

  it('a non-member cannot send', async () => {
    const { service, messages } = build();
    await expect(service.send('acc-stranger', 'lames-de-brume', { text: 'coucou' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(messages.sendMessage).not.toHaveBeenCalled();
  });
});
