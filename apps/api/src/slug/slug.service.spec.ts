import { Test, TestingModule } from '@nestjs/testing';
import { SlugService } from './slug.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = () => ({
  account: { findMany: jest.fn() },
});

describe('SlugService', () => {
  let service: SlugService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlugService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<SlugService>(SlugService);
  });

  describe('slugify', () => {
    it('lowercases and hyphenates "Yuki Moreau" → "yuki-moreau"', () => {
      expect(service.slugify('Yuki Moreau')).toBe('yuki-moreau');
    });

    it('strips accents: "Élise Dubé" → "elise-dube"', () => {
      expect(service.slugify('Élise Dubé')).toBe('elise-dube');
    });

    it('collapses multiple separators into one hyphen', () => {
      expect(service.slugify('Jean--Pierre  Morin')).toBe('jean-pierre-morin');
    });

    it('trims leading/trailing hyphens', () => {
      expect(service.slugify('  Nom  ')).toBe('nom');
    });
  });

  describe('ensureUniqueSlug', () => {
    it('returns base slug when no collision', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      expect(await service.ensureUniqueSlug('yuki-moreau')).toBe('yuki-moreau');
    });

    it('appends -2 on first collision', async () => {
      prisma.account.findMany.mockResolvedValue([{ profileSlug: 'yuki-moreau' }]);
      expect(await service.ensureUniqueSlug('yuki-moreau')).toBe('yuki-moreau-2');
    });

    it('appends -3 when -2 is also taken', async () => {
      prisma.account.findMany.mockResolvedValue([
        { profileSlug: 'yuki-moreau' },
        { profileSlug: 'yuki-moreau-2' },
      ]);
      expect(await service.ensureUniqueSlug('yuki-moreau')).toBe('yuki-moreau-3');
    });
  });
});
