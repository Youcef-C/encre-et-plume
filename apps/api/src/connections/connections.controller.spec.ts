import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConnectionsController, parseUserIds } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { PresenceService } from './presence.service';
import { SessionGuard } from '../auth/guards/session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';
import { DecideConnectionRequestDto } from './dto/decide-connection-request.dto';
import { CreateConnectionRequestDto } from './dto/create-connection-request.dto';

function req(accountId = 'acc-1', query: Record<string, unknown> = {}): AuthRequest {
  return { accountId, query } as unknown as AuthRequest;
}

describe('ConnectionsController', () => {
  let controller: ConnectionsController;
  let service: Record<string, jest.Mock>;
  let presence: { get: jest.Mock };

  beforeEach(async () => {
    service = {
      listContacts: jest.fn().mockResolvedValue({ items: [] }),
      removeContact: jest.fn().mockResolvedValue(undefined),
      listRequests: jest.fn().mockResolvedValue({ items: [] }),
      createRequest: jest.fn().mockResolvedValue({ id: 'c1', status: 'pending' }),
      decide: jest.fn().mockResolvedValue({ id: 'c1', status: 'accepted' }),
      suggestions: jest.fn().mockResolvedValue({ items: [], incompleteProfile: false }),
      peopleSearch: jest.fn().mockResolvedValue({ items: [] }),
    };
    presence = { get: jest.fn().mockResolvedValue({ 'acc-9': { online: true, lastSeen: 't' } }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [
        { provide: ConnectionsService, useValue: service },
        { provide: PresenceService, useValue: presence },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ConnectionsController>(ConnectionsController);
  });

  it('is guarded by SessionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ConnectionsController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('lists contacts scoped to the session account', async () => {
    await controller.listContacts(req('acc-owner'));
    expect(service.listContacts).toHaveBeenCalledWith('acc-owner');
  });

  it('removes a contact scoped to the session account (id from the path)', async () => {
    await controller.removeContact(req('acc-owner'), 'acc-x');
    expect(service.removeContact).toHaveBeenCalledWith('acc-owner', 'acc-x');
  });

  it('lists incoming requests for the session account by default', async () => {
    await controller.listRequests(req('acc-owner'));
    expect(service.listRequests).toHaveBeenCalledWith('acc-owner', 'incoming');
  });

  it('lists outgoing requests when direction=outgoing', async () => {
    await controller.listRequests(req('acc-owner'), 'outgoing');
    expect(service.listRequests).toHaveBeenCalledWith('acc-owner', 'outgoing');
  });

  it('creates a request from the session account (never a client id)', async () => {
    await controller.createRequest(req('acc-owner'), { toUser: 'acc-x' } as CreateConnectionRequestDto);
    expect(service.createRequest).toHaveBeenCalledWith('acc-owner', { toUser: 'acc-x' });
  });

  it('decides a request scoped to the session account (id from the path, status from the body)', async () => {
    await controller.decide(req('acc-owner'), 'c9', { status: 'accepted' } as DecideConnectionRequestDto);
    expect(service.decide).toHaveBeenCalledWith('acc-owner', 'c9', 'accepted');
  });

  it('returns suggestions for the session account', async () => {
    await controller.suggestions(req('acc-owner'));
    expect(service.suggestions).toHaveBeenCalledWith('acc-owner');
  });

  it('runs people search scoped to the session account with the q param', async () => {
    await controller.peopleSearch(req('acc-owner', { q: 'lyon' }));
    expect(service.peopleSearch).toHaveBeenCalledWith('acc-owner', 'lyon');
  });

  it('shapes presence into a PresenceResponse item array', async () => {
    const res = await controller.presence(req('acc-owner', { userIds: 'acc-9' }));
    expect(presence.get).toHaveBeenCalledWith(['acc-9']);
    expect(res.items).toEqual([{ userId: 'acc-9', online: true, lastSeen: 't' }]);
  });

  describe('parseUserIds', () => {
    it('splits a comma-separated value', () => {
      expect(parseUserIds('a,b,c')).toEqual(['a', 'b', 'c']);
    });
    it('accepts a repeated query key (array)', () => {
      expect(parseUserIds(['a', 'b'])).toEqual(['a', 'b']);
    });
    it('drops blanks and caps at 100 ids', () => {
      expect(parseUserIds('a,,b')).toEqual(['a', 'b']);
      expect(parseUserIds(Array.from({ length: 150 }, (_, i) => `u${i}`))).toHaveLength(100);
    });
    it('returns [] for a missing param', () => {
      expect(parseUserIds(undefined)).toEqual([]);
    });
  });

  describe('DecideConnectionRequestDto validation', () => {
    it.each([['accepted'], ['declined']])('accepts %s', async (status) => {
      expect(await validate(plainToInstance(DecideConnectionRequestDto, { status }))).toHaveLength(0);
    });
    it.each([['pending'], ['rejected'], [''], [undefined]])('rejects %s (→ 400)', async (status) => {
      expect(await validate(plainToInstance(DecideConnectionRequestDto, { status }))).not.toHaveLength(0);
    });
  });

  describe('CreateConnectionRequestDto validation', () => {
    it('accepts a non-empty toUser', async () => {
      expect(await validate(plainToInstance(CreateConnectionRequestDto, { toUser: 'acc-x' }))).toHaveLength(0);
    });
    it.each([[''], [undefined]])('rejects an empty toUser %s (→ 400)', async (toUser) => {
      expect(await validate(plainToInstance(CreateConnectionRequestDto, { toUser }))).not.toHaveLength(0);
    });
  });
});
