import { CloseCallProcessor } from './close-call.processor';
import { PrismaService } from '../../prisma/prisma.service';
import type { Job } from 'bullmq';

describe('CloseCallProcessor', () => {
  let processor: CloseCallProcessor;
  let prisma: { projectCall: { updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = { projectCall: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    processor = new CloseCallProcessor(prisma as unknown as PrismaService);
  });

  it('targets the calls queue', () => {
    expect(processor.queue).toBe('calls');
  });

  it('flips an open call to closed (scoped to still-open rows)', async () => {
    await processor.process({ callId: 'call-1' }, {} as Job);
    expect(prisma.projectCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', status: 'open' },
      data: { status: 'closed' },
    });
  });

  it('is a no-op when the call is already closed (updateMany matches nothing)', async () => {
    prisma.projectCall.updateMany.mockResolvedValue({ count: 0 });
    await expect(processor.process({ callId: 'call-1' }, {} as Job)).resolves.toBeUndefined();
  });
});
