import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  Queue: vi.fn(),
  getQueueRedisConnection: vi.fn(),
}));

vi.mock('bullmq', () => ({ Queue: mocks.Queue }));
vi.mock('../config/redis.js', () => ({
  getQueueRedisConnection: mocks.getQueueRedisConnection,
}));

import {
  AI_TRIAGE_JOB_NAME,
  AI_TRIAGE_QUEUE_NAME,
  closeAiTriageQueue,
  enqueueAiTriageJob,
  getAiTriageQueue,
} from './ai-triage.queue.js';

describe('AI triage queue', () => {
  beforeEach(async () => {
    await closeAiTriageQueue();
    vi.clearAllMocks();
    mocks.add.mockResolvedValue({});
    mocks.close.mockResolvedValue(undefined);
    mocks.Queue.mockImplementation(function QueueMock() {
      return {
        add: mocks.add,
        close: mocks.close,
      };
    });
    mocks.getQueueRedisConnection.mockReturnValue('redis-connection');
  });

  it('creates one queue with retry and bounded-retention defaults', () => {
    const queue = getAiTriageQueue();

    expect(queue).toEqual({ add: mocks.add, close: mocks.close });
    expect(mocks.Queue).toHaveBeenCalledWith(AI_TRIAGE_QUEUE_NAME, {
      connection: 'redis-connection',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
      },
    });
  });

  it('enqueues a deterministic job that contains only the ticket id', async () => {
    await enqueueAiTriageJob('42');

    expect(mocks.add).toHaveBeenCalledWith(
      AI_TRIAGE_JOB_NAME,
      { ticketId: '42' },
      { jobId: 'ai-triage-ticket-42' },
    );
  });
});
