import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateInvitationDto } from './create-invitation.dto';
import { INVITATION_MESSAGE_MAX } from '@encre-et-plume/shared';

function errorsFor(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateInvitationDto, payload));
}

describe('CreateInvitationDto', () => {
  it('accepts a minimal { toUser } body (projectId + message optional)', () => {
    expect(errorsFor({ toUser: 'acc-to' })).toHaveLength(0);
  });

  it('rejects a missing/empty toUser', () => {
    expect(errorsFor({}).length).toBeGreaterThan(0);
    expect(errorsFor({ toUser: '' }).length).toBeGreaterThan(0);
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
