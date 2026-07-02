// F-16: EmailService.send() unit tests.
import { EmailService } from './email.service';
import type { QueueService } from '../queue/queue.service';

describe('EmailService.send', () => {
  let service: EmailService;
  let queueService: { enqueue: jest.Mock };

  beforeEach(() => {
    queueService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new EmailService(queueService as unknown as QueueService);
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

  it('mandatory template always enqueues (preference seam is always-send)', async () => {
    // All Compte templates are mandatory; preference check is a seam — always sends
    await service.send('password_reset', 'yuki@test.com', { displayName: 'Yuki', resetUrl: 'http://x' });
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('enqueues email_verification with correct params shape', async () => {
    await service.send('email_verification', 'yuki@test.com', { displayName: 'Yuki', verifyUrl: 'http://verify' });

    const [, , data] = queueService.enqueue.mock.calls[0] as [string, string, { to: string; template: string; params: Record<string, string> }];
    expect(data.template).toBe('email_verification');
    expect(data.params['displayName']).toBe('Yuki');
    expect(data.params['verifyUrl']).toBe('http://verify');
  });
});
