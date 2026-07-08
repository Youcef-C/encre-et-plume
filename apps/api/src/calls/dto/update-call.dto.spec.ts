import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateCallDto } from './update-call.dto';

function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(UpdateCallDto, payload));
}
const propsOf = (payload: Record<string, unknown>) => errorsFor(payload).map((e) => e.property);
const FUTURE = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

describe('UpdateCallDto', () => {
  it('accepts an empty body (every field optional — the service rejects it)', () => {
    expect(errorsFor({})).toHaveLength(0);
  });

  it('accepts the close body { status: closed }', () => {
    expect(errorsFor({ status: 'closed' })).toHaveLength(0);
  });

  it('rejects any status other than closed', () => {
    expect(propsOf({ status: 'open' })).toContain('status');
  });

  it('accepts a partial field edit', () => {
    expect(errorsFor({ title: '« Nouveau »', genres: ['seinen'], seats: { dessinateur: 2 }, deadline: FUTURE })).toHaveLength(0);
  });

  it('rejects an empty title, an unknown genre, invalid seats and a past deadline', () => {
    expect(propsOf({ title: '' })).toContain('title');
    expect(propsOf({ genres: ['not-a-genre'] })).toContain('genres');
    expect(propsOf({ seats: { wizard: 1 } })).toContain('seats');
    expect(propsOf({ deadline: '2000-01-01T00:00:00.000Z' })).toContain('deadline');
  });
});
