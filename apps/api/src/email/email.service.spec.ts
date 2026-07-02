// F-16 + F-15: EmailService.send() unit tests.
import { EMAIL_TEMPLATES } from '@encre-et-plume/shared';
import type { EmailTemplateKey } from '@encre-et-plume/shared';
import { EmailService } from './email.service';
import type { QueueService } from '../queue/queue.service';
import type { NotificationPreferencesService } from '../preferences/preferences.service';

describe('EmailService.send', () => {
  let service: EmailService;
  let queueService: { enqueue: jest.Mock };
  let preferences: { isEmailAllowedByAddress: jest.Mock };

  beforeEach(() => {
    queueService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    preferences = { isEmailAllowedByAddress: jest.fn().mockResolvedValue(true) };
    service = new EmailService(
      queueService as unknown as QueueService,
      preferences as unknown as NotificationPreferencesService,
    );
  });

  it('throws for an unknown template key', async () => {
    await expect(
      service.send('unknown_template' as 'welcome', 'user@test.com', { displayName: 'Test' }),
    ).rejects.toThrow();
  });

  it('enqueues one email job for a known Compte template', async () => {
    await service.send('welcome', 'yuki@test.com', { displayName: 'Yuki' });

    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    const [queue, jobName, data] = queueService.enqueue.mock.calls[0] as [
      string,
      string,
      { to: string; template: string; params: Record<string, string> },
    ];
    expect(queue).toBe('email');
    expect(jobName).toBe('welcome');
    expect(data.to).toBe('yuki@test.com');
    expect(data.template).toBe('welcome');
    expect(data.params).toMatchObject({ displayName: 'Yuki' });
  });

  it('forwards idempotencyKey to enqueue options', async () => {
    await service.send('email_verification', 'yuki@test.com', { displayName: 'Yuki', verifyUrl: 'http://x' }, { idempotencyKey: 'key-123' });

    const [, , , opts] = queueService.enqueue.mock.calls[0] as [string, string, unknown, { idempotencyKey?: string }];
    expect(opts?.idempotencyKey).toBe('key-123');
  });

  it('mandatory template always enqueues regardless of preference (BE-5 / F-15)', async () => {
    // All Compte templates are mandatory; preference check bypassed for mandatory
    preferences.isEmailAllowedByAddress.mockResolvedValue(false); // simulate opted-out
    await service.send('password_reset', 'yuki@test.com', { displayName: 'Yuki', resetUrl: 'http://x' });
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('non-mandatory template is skipped when user has opted out (BE-5 / F-15)', async () => {
    // Temporarily inject a non-mandatory template entry to test the gate
    const fakeKey = '__test_engagement__' as EmailTemplateKey;
    (EMAIL_TEMPLATES as Record<string, unknown>)[fakeKey] = {
      key: fakeKey, group: 'engagement', mandatory: false,
    };
    preferences.isEmailAllowedByAddress.mockResolvedValue(false);

    try {
      await service.send(fakeKey, 'yuki@test.com', {} as never);
      expect(queueService.enqueue).not.toHaveBeenCalled();
    } finally {
      delete (EMAIL_TEMPLATES as Record<string, unknown>)[fakeKey];
    }
  });

  it('non-mandatory template is sent when user has not opted out (BE-5 / F-15)', async () => {
    const fakeKey = '__test_engagement_2__' as EmailTemplateKey;
    (EMAIL_TEMPLATES as Record<string, unknown>)[fakeKey] = {
      key: fakeKey, group: 'engagement', mandatory: false,
    };
    preferences.isEmailAllowedByAddress.mockResolvedValue(true);

    try {
      await service.send(fakeKey, 'yuki@test.com', {} as never);
      expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    } finally {
      delete (EMAIL_TEMPLATES as Record<string, unknown>)[fakeKey];
    }
  });

  it('enqueues email_verification with correct params shape', async () => {
    await service.send('email_verification', 'yuki@test.com', { displayName: 'Yuki', verifyUrl: 'http://verify' });

    const [, , data] = queueService.enqueue.mock.calls[0] as [string, string, { to: string; template: string; params: Record<string, string> }];
    expect(data.template).toBe('email_verification');
    expect(data.params['displayName']).toBe('Yuki');
    expect(data.params['verifyUrl']).toBe('http://verify');
  });
});
