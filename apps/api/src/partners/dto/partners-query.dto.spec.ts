import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PartnersQueryDto } from './partners-query.dto';

async function instanceFor(query: Record<string, unknown>): Promise<PartnersQueryDto> {
  return plainToInstance(PartnersQueryDto, query);
}

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(await instanceFor(query));
  return errors.map((e) => e.property);
}

describe('PartnersQueryDto', () => {
  it('accepts an empty query', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts valid enum values', async () => {
    expect(
      await errorsFor({ role: 'dessinateur', genres: ['josei'], locations: ['Bretagne'], availability: 'disponible' }),
    ).toEqual([]);
  });

  describe('genres / locations arrays', () => {
    it('accepts repeated query keys as arrays', async () => {
      expect(await errorsFor({ genres: ['josei', 'seinen'], locations: ['Bretagne', 'Occitanie'] })).toEqual([]);
    });

    it('accepts mixed location tokens — continent, ISO code, French région', async () => {
      expect(await errorsFor({ locations: ['Europe', 'JP', 'Bretagne'] })).toEqual([]);
    });

    it('wraps a lone repeated key (Nest delivers it as a string) into a one-element array', async () => {
      const dto = await instanceFor({ genres: 'josei', locations: 'JP' });
      expect(dto.genres).toEqual(['josei']);
      expect(dto.locations).toEqual(['JP']);
      expect(await validate(dto)).toEqual([]);
    });

    it('rejects the whole facet when any genre element is unknown', async () => {
      expect(await errorsFor({ genres: ['josei', 'not-a-real-genre-id'] })).toContain('genres');
    });

    it('rejects the whole facet when any location element is unknown', async () => {
      expect(await errorsFor({ locations: ['Bretagne', 'Atlantide'] })).toContain('locations');
    });

    it('rejects the retired "Hors France" bucket as a location token', async () => {
      expect(await errorsFor({ locations: ['Hors France'] })).toContain('locations');
    });

    it('injects no default when locations is absent', async () => {
      const dto = await instanceFor({});
      expect(dto.locations).toBeUndefined();
    });
  });

  it.each([
    ['role', { role: 'wizard' }],
    ['availability', { availability: 'maybe' }],
  ])('rejects an unknown %s value', async (field, query) => {
    expect(await errorsFor(query)).toContain(field);
  });

  it('ignores viewerRole — it is no longer a recognized param', async () => {
    // viewerRole was removed (feedback §1); an extra key is silently ignored, never a 400.
    expect(await errorsFor({ viewerRole: 'scenariste' })).toEqual([]);
  });
});
