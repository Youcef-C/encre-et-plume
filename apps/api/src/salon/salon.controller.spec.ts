import { SessionGuard } from '../auth/guards/session.guard';
import { SalonController } from './salon.controller';
import type { SalonService } from './salon.service';
import type { AuthRequest } from '../auth/guards/session.guard';

const req = { accountId: 'acc-1' } as AuthRequest;

function build() {
  const service = {
    getSummary: jest.fn().mockResolvedValue({ conversationId: 's', name: 'Le Comptoir', onlineCount: 0, unreadCount: 0, isMember: false }),
    getMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getOnlineUsers: jest.fn().mockResolvedValue({ items: [] }),
    join: jest.fn().mockResolvedValue({ isMember: true }),
    leave: jest.fn().mockResolvedValue({ isMember: false }),
    sendMessage: jest.fn().mockResolvedValue({ id: 'm', senderId: 'acc-1', senderName: 'Me', body: 'hi', createdAt: 'x' }),
    markRead: jest.fn().mockResolvedValue({ unreadCount: 0 }),
  };
  return { controller: new SalonController(service as unknown as SalonService), service };
}

describe('SalonController', () => {
  it('is guarded by SessionGuard (authenticated users only)', () => {
    const guards = Reflect.getMetadata('__guards__', SalonController) ?? [];
    expect(guards).toContain(SessionGuard);
  });

  it('GET /salon delegates the session account', async () => {
    const { controller, service } = build();
    await controller.summary(req);
    expect(service.getSummary).toHaveBeenCalledWith('acc-1');
  });

  it('GET /salon/messages passes cursor + parsed limit', async () => {
    const { controller, service } = build();
    await controller.messages(req, 'cur', '25');
    expect(service.getMessages).toHaveBeenCalledWith('acc-1', { cursor: 'cur', limit: 25 });
  });

  it('GET /salon/online delegates', async () => {
    const { controller, service } = build();
    await controller.online(req);
    expect(service.getOnlineUsers).toHaveBeenCalled();
  });

  it('POST /salon/join and /salon/leave use the session account', async () => {
    const { controller, service } = build();
    await controller.join(req);
    await controller.leave(req);
    expect(service.join).toHaveBeenCalledWith('acc-1');
    expect(service.leave).toHaveBeenCalledWith('acc-1');
  });

  it('POST /salon/messages forwards the body dto', async () => {
    const { controller, service } = build();
    await controller.send(req, { body: 'Bonjour' });
    expect(service.sendMessage).toHaveBeenCalledWith('acc-1', { body: 'Bonjour' });
  });

  it('POST /salon/read delegates', async () => {
    const { controller, service } = build();
    await controller.read(req);
    expect(service.markRead).toHaveBeenCalledWith('acc-1');
  });
});
