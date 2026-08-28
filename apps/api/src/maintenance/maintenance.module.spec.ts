import { MaintenanceModule } from './maintenance.module';
import { QueueService } from '../queue/queue.service';

describe('MaintenanceModule (F-25)', () => {
  it('B2 · registers the nightly gc sweep on the maintenance queue at 04:00', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new MaintenanceModule(queue as unknown as QueueService).onModuleInit();

    // 04:00 — one hour after DR-13's 03:00 analytics cron, so the two do not contend.
    expect(queue.schedule).toHaveBeenCalledWith('maintenance', 'gc', {}, { pattern: '0 4 * * *' });
  });

  it('CS-21 B2 · registers the 10-minute scenario-compaction safety net on the same queue', async () => {
    const queue = { schedule: jest.fn().mockResolvedValue(undefined) };
    await new MaintenanceModule(queue as unknown as QueueService).onModuleInit();

    expect(queue.schedule).toHaveBeenCalledWith('maintenance', 'scenario-compaction', {}, { pattern: '*/10 * * * *' });
  });

  it('B2 · a Redis outage at boot is not fatal', async () => {
    const queue = { schedule: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(
      new MaintenanceModule(queue as unknown as QueueService).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
