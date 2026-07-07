import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCallDto } from './create-call.dto';

function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateCallDto, payload));
}

const FUTURE = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

const VALID = (o: Record<string, unknown> = {}) => ({
  direction: 'writerSeeksIllustrator',
  title: '« Lames de Brume »',
  description: 'Un thriller urbain mélancolique.',
  genres: ['seinen', 'thriller'],
  scope: '~120 planches',
  deadline: FUTURE,
  ...o,
});

const propsOf = (payload: Record<string, unknown>) => errorsFor(payload).map((e) => e.property);

describe('CreateCallDto', () => {
  it('accepts a valid body', () => {
    expect(errorsFor(VALID())).toHaveLength(0);
  });

  it('accepts an optional format instead of scope', () => {
    expect(errorsFor(VALID({ scope: undefined, format: 'one_shot', genres: ['supernatural'] }))).toHaveLength(0);
  });

  it('rejects a missing/invalid direction', () => {
    expect(propsOf(VALID({ direction: undefined }))).toContain('direction');
    expect(propsOf(VALID({ direction: 'sideways' }))).toContain('direction');
  });

  it('rejects an empty or over-long title', () => {
    expect(propsOf(VALID({ title: '' }))).toContain('title');
    expect(propsOf(VALID({ title: 'a'.repeat(121) }))).toContain('title');
  });

  it('rejects an empty or over-long description', () => {
    expect(propsOf(VALID({ description: '' }))).toContain('description');
    expect(propsOf(VALID({ description: 'a'.repeat(1001) }))).toContain('description');
  });

  it('rejects an unknown genre id', () => {
    expect(propsOf(VALID({ genres: ['seinen', 'not-a-genre'] }))).toContain('genres');
  });

  it('rejects an empty genre list and more than 5 genres', () => {
    expect(propsOf(VALID({ genres: [] }))).toContain('genres');
    expect(propsOf(VALID({ genres: ['seinen', 'thriller', 'josei', 'romance', 'supernatural', 'action'] }))).toContain(
      'genres',
    );
  });

  it('rejects an invalid format', () => {
    expect(propsOf(VALID({ format: 'graphic-novel' }))).toContain('format');
  });

  it('rejects an over-long scope', () => {
    expect(propsOf(VALID({ scope: 'a'.repeat(61) }))).toContain('scope');
  });

  it('rejects a missing deadline', () => {
    expect(propsOf(VALID({ deadline: undefined }))).toContain('deadline');
  });

  it('rejects a past deadline', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(propsOf(VALID({ deadline: past }))).toContain('deadline');
  });

  it('rejects a non-ISO deadline', () => {
    expect(propsOf(VALID({ deadline: 'demain' }))).toContain('deadline');
  });
});
