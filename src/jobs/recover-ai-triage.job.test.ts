import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findQueuedTicketsForRecovery: vi.fn(),
  enqueueAiTriageJob: vi.fn(),
}));

vi.mock('../modules/tickets/tickets.repository.js', () => ({
  findQueuedTicketsForRecovery: mocks.findQueuedTicketsForRecovery,
}));
vi.mock('../queues/ai-triage.queue.js', () => ({
  enqueueAiTriageJob: mocks.enqueueAiTriageJob,
}));

import { recoverQueuedAiTriageTickets } from './recover-ai-triage.job.js';

describe('recoverQueuedAiTriageTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-enqueues queued tickets by id and keeps recovering after one Redis failure', async () => {
    mocks.findQueuedTicketsForRecovery.mockResolvedValueOnce([
      { id: '41' },
      { id: '42' },
    ]);
    mocks.enqueueAiTriageJob.mockResolvedValueOnce(undefined);
    mocks.enqueueAiTriageJob.mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(recoverQueuedAiTriageTickets()).resolves.toBe(1);

    expect(mocks.enqueueAiTriageJob).toHaveBeenNthCalledWith(1, '41');
    expect(mocks.enqueueAiTriageJob).toHaveBeenNthCalledWith(2, '42');
    consoleError.mockRestore();
  });
});
