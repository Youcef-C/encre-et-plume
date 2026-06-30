import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SessionGuard } from '../auth/guards/session.guard';

const PROFILE_RESPONSE = {
  slug: 'yuki-moreau',
  displayName: 'Yuki Moreau',
  avatar: null,
  coverImage: null,
  roleLine: 'encre & screentone · Lyon, FR',
  specialty: 'encre & screentone',
  city: 'Lyon, FR',
  bio: null,
  seeking: { active: false, targetRole: null, genres: [], projectLength: null, text: null },
  tags: [],
  counters: { followers: 0, likes: 0, works: 0, supporters: 0 },
};

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: { getBySlug: jest.Mock; updateMine: jest.Mock; getPortfolio: jest.Mock };

  beforeEach(async () => {
    service = {
      getBySlug: jest.fn(),
      updateMine: jest.fn(),
      getPortfolio: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it('GET /profiles/:slug delegates to getBySlug', async () => {
    service.getBySlug.mockResolvedValue(PROFILE_RESPONSE);

    const res = await controller.getBySlug('yuki-moreau');

    expect(res).toEqual(PROFILE_RESPONSE);
    expect(service.getBySlug).toHaveBeenCalledWith('yuki-moreau');
  });

  it('GET /profiles/:slug propagates NotFoundException (unknown slug → 404)', async () => {
    service.getBySlug.mockRejectedValue(new NotFoundException());

    await expect(controller.getBySlug('no-such')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET /profiles/:slug/portfolio delegates to getPortfolio', async () => {
    service.getPortfolio.mockResolvedValue([]);

    const res = await controller.getPortfolio('yuki-moreau');

    expect(res).toEqual([]);
    expect(service.getPortfolio).toHaveBeenCalledWith('yuki-moreau');
  });

  it('PATCH /profiles/me delegates to updateMine with accountId from request', async () => {
    service.updateMine.mockResolvedValue(PROFILE_RESPONSE);
    const req = { accountId: 'acc-1' } as import('../auth/guards/session.guard').AuthRequest;

    const res = await controller.updateMine(req, { bio: 'updated' } as import('./dto/update-profile.dto').UpdateProfileDto);

    expect(res).toEqual(PROFILE_RESPONSE);
    expect(service.updateMine).toHaveBeenCalledWith('acc-1', { bio: 'updated' });
  });
});
