import { AnalyticsModule } from './analytics.module';
import { QueueService } from '../queue/queue.service';

describe('AnalyticsModule', () => {
  it('B7 · registers the nightly trending recompute on the analytics queue', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new AnalyticsModule(queue as unknown as QueueService).onModuleInit();

    expect(queue.schedule).toHaveBeenCalledWith('analytics', 'recompute-trending', {}, { pattern: '0 3 * * *' });
  });

  it('F-23 B8 · registers the minute event flush on the same queue', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new AnalyticsModule(queue as unknown as QueueService).onModuleInit();

    expect(queue.schedule).toHaveBeenCalledWith('analytics', 'flush-events', {}, { pattern: '* * * * *' });
  });

  it('F-23 B13 · registers the nightly rollup on the same queue', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new AnalyticsModule(queue as unknown as QueueService).onModuleInit();

    expect(queue.schedule).toHaveBeenCalledWith('analytics', 'rollup-daily', {}, { pattern: '0 3 * * *' });
  });

  it('B7 · a Redis outage at boot is not fatal', async () => {
    const queue = { schedule: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(
      new AnalyticsModule(queue as unknown as QueueService).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
