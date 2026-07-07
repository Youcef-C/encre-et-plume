import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { InvitationsController, parseDirection, parsePage, parsePageSize } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('parseDirection', () => {
  it('accepts sent and received', () => {
    expect(parseDirection('sent')).toBe('sent');
    expect(parseDirection('received')).toBe('received');
  });
  it('throws 400 on missing or invalid direction', () => {
    expect(() => parseDirection(undefined)).toThrow(BadRequestException);
    expect(() => parseDirection('inbox')).toThrow(BadRequestException);
  });
});

describe('parsePage / parsePageSize', () => {
  it('page defaults to 1 and never throws', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('3')).toBe(3);
  });
  it('pageSize defaults to 20, clamps to 50', () => {
    expect(parsePageSize(undefined)).toBe(20);
    expect(parsePageSize('999')).toBe(50);
    expect(parsePageSize('10')).toBe(10);
  });
});

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let service: { create: jest.Mock; list: jest.Mock; respond: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
      respond: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<InvitationsController>(InvitationsController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InvitationsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('POST passes the session accountId + body to the service', async () => {
    const body = { toUser: 'acc-to', message: 'hi' };
    await controller.create({ accountId: 'acc-from' } as never, body as never);
    expect(service.create).toHaveBeenCalledWith('acc-from', body);
  });

  it('GET parses direction + pagination and scopes to the session account', async () => {
    await controller.list({ accountId: 'acc-me', query: { direction: 'sent', page: '2', pageSize: '999' } } as never);
    expect(service.list).toHaveBeenCalledWith('acc-me', 'sent', 2, 50);
  });

  it('PATCH passes accountId, id and body', async () => {
    await controller.respond({ accountId: 'acc-me' } as never, 'inv-1', { status: 'accepted' } as never);
    expect(service.respond).toHaveBeenCalledWith('acc-me', 'inv-1', { status: 'accepted' });
  });
});
