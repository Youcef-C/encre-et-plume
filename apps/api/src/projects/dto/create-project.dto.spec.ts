import 'reflect-metadata'; // CreateProjectDto uses @Type/@ValidateNested (ProjectSeekingDto) — needs the polyfill
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProjectDto } from './create-project.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateProjectDto, body);
  const errors = await validate(dto, { whitelist: true });
  // flatten nested (seeking) property paths into their parent property name
  return errors.map((e) => e.property);
}

describe('CreateProjectDto', () => {
  it('accepts a minimal { type, title }', async () => {
    expect(await errorsFor({ type: 'manga', title: 'Lames de Brume' })).toEqual([]);
  });

  it('accepts a full valid body', async () => {
    expect(
      await errorsFor({
        type: 'story',
        title: 'Encre Blanche',
        synopsis: 'Un récit.',
        hashtags: ['thriller', 'noir'],
        format: 'oneshot',
        contestId: 'c1',
        genre: 'seinen',
        themes: ['action', 'adventure'],
        audienceRating: '16+',
        visibility: 'public',
        invites: ['acc-a', 'acc-b'],
        seeking: { scenariste: 1, dessinateur: 2 },
        tiers: [{ name: 'Bronze', priceCents: 300 }],
        allowDonations: true,
        goals: [{ title: 'Impression', targetCents: 50000 }],
        revenueSplit: [{ accountId: 'acc-me', pct: 100 }],
        cover: { mediaId: 'm1' },
      }),
    ).toEqual([]);
  });

  it('rejects a missing type', async () => {
    expect(await errorsFor({ title: 'X' })).toContain('type');
  });

  it('rejects an unknown type', async () => {
    expect(await errorsFor({ type: 'bd', title: 'X' })).toContain('type');
  });

  it('rejects a missing title', async () => {
    expect(await errorsFor({ type: 'manga' })).toContain('title');
  });

  it('rejects an empty / whitespace title', async () => {
    expect(await errorsFor({ type: 'manga', title: '   ' })).toContain('title');
  });

  it('rejects a bad format', async () => {
    expect(await errorsFor({ type: 'manga', title: 'X', format: 'saga' })).toContain('format');
  });

  it('rejects a bad visibility', async () => {
    expect(await errorsFor({ type: 'manga', title: 'X', visibility: 'secret' })).toContain('visibility');
  });

  it('rejects a bad audienceRating', async () => {
    expect(await errorsFor({ type: 'manga', title: 'X', audienceRating: '21+' })).toContain('audienceRating');
  });

  it('rejects seeking counts out of range (>5)', async () => {
    expect(await errorsFor({ type: 'manga', title: 'X', seeking: { scenariste: 9 } })).toContain('seeking');
  });

  it('rejects seeking counts below 0', async () => {
    expect(await errorsFor({ type: 'manga', title: 'X', seeking: { dessinateur: -1 } })).toContain('seeking');
  });

  it('rejects more than 20 invites', async () => {
    const invites = Array.from({ length: 21 }, (_, i) => `acc-${i}`);
    expect(await errorsFor({ type: 'manga', title: 'X', invites })).toContain('invites');
  });

  it('rejects more than 8 themes', async () => {
    const themes = Array.from({ length: 9 }, (_, i) => `t${i}`);
    expect(await errorsFor({ type: 'manga', title: 'X', themes })).toContain('themes');
  });
});
