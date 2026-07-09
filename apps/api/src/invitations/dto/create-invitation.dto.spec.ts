import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateInvitationDto } from './create-invitation.dto';
import { INVITATION_MAX_RECIPIENTS, INVITATION_MESSAGE_MAX } from '@encre-et-plume/shared';

function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateInvitationDto, payload));
}

describe('CreateInvitationDto', () => {
  it('accepts legacy single-recipient sugar { toUser } (projectId + message optional)', () => {
    expect(errorsFor({ toUser: 'acc-to' })).toHaveLength(0);
  });

  it('accepts a multi-recipient { toUsers } body', () => {
    expect(errorsFor({ kind: 'direct', toUsers: ['a', 'b'] })).toHaveLength(0);
  });

  it('rejects an empty toUser (legacy sugar must be non-empty when present)', () => {
    expect(errorsFor({ toUser: '' }).length).toBeGreaterThan(0);
  });

  it('rejects an empty toUsers array (@ArrayNotEmpty)', () => {
    const errors = errorsFor({ toUsers: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('toUsers');
  });

  it('rejects more than INVITATION_MAX_RECIPIENTS recipients', () => {
    const tooMany = Array.from({ length: INVITATION_MAX_RECIPIENTS + 1 }, (_, i) => `u${i}`);
    const errors = errorsFor({ toUsers: tooMany });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('toUsers');
  });

  it("rejects kind: 'join' (Mode B deferred to CS-10)", () => {
    const errors = errorsFor({ kind: 'join', toUsers: ['a'] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('kind');
  });

  it("accepts kind: 'direct'", () => {
    expect(errorsFor({ kind: 'direct', toUser: 'acc-to' })).toHaveLength(0);
  });

  it('accepts a message at the length limit', () => {
    expect(errorsFor({ toUser: 'acc-to', message: 'a'.repeat(INVITATION_MESSAGE_MAX) })).toHaveLength(0);
  });

  it('rejects a message over the length limit', () => {
    const errors = errorsFor({ toUser: 'acc-to', message: 'a'.repeat(INVITATION_MESSAGE_MAX + 1) });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('message');
  });
});
