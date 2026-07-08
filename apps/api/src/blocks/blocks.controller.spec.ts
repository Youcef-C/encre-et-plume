import { BadRequestException } from '@nestjs/common';
import { BlocksController } from './blocks.controller';
import type { BlocksService } from './blocks.service';
import type { AuthRequest } from '../auth/guards/session.guard';

const req = { accountId: 'acc-a' } as AuthRequest;

function build() {
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'blk-1', userId: 'acc-b', kind: 'block', createdAt: 'x' }),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ items: [] }),
  };
  return { controller: new BlocksController(service as unknown as BlocksService), service };
}

describe('BlocksController', () => {
  it('POST delegates the session account as the blocker', async () => {
    const { controller, service } = build();
    await controller.create(req, { userId: 'acc-b', kind: 'block' });
    expect(service.create).toHaveBeenCalledWith('acc-a', { userId: 'acc-b', kind: 'block' });
  });

  it('GET lists the caller own rows', async () => {
    const { controller, service } = build();
    await controller.list(req);
    expect(service.list).toHaveBeenCalledWith('acc-a');
  });

  it('DELETE passes a valid kind through', async () => {
    const { controller, service } = build();
    await controller.remove(req, 'acc-b', 'mute');
    expect(service.remove).toHaveBeenCalledWith('acc-a', 'acc-b', 'mute');
  });

  it('DELETE 400s on a missing or invalid kind query', async () => {
    const { controller, service } = build();
    await expect(controller.remove(req, 'acc-b', undefined)).rejects.toThrow(BadRequestException);
    await expect(controller.remove(req, 'acc-b', 'nope')).rejects.toThrow(BadRequestException);
    expect(service.remove).not.toHaveBeenCalled();
  });
});
