import { AnalyticsModule } from './analytics.module';
import { QueueService } from '../queue/queue.service';

describe('AnalyticsModule', () => {
  it('B7 · registers the nightly trending recompute on the analytics queue', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new AnalyticsModule(queue as unknown as QueueService).onModuleInit();

    expect(queue.schedule).toHaveBeenCalledWith('analytics', 'recompute-trending', {}, { pattern: '0 3 * * *' });
  });

  it('B7 · a Redis outage at boot is not fatal', async () => {
    const queue = { schedule: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(
      new AnalyticsModule(queue as unknown as QueueService).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
