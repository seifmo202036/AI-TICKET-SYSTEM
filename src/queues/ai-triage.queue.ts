import { Queue } from 'bullmq';

import { getQueueRedisConnection } from '../config/redis.js';

export const AI_TRIAGE_QUEUE_NAME = 'ai-triage';
export const AI_TRIAGE_JOB_NAME = 'triage-ticket';

export type AiTriageJobData = {
  ticketId: string;
};

let aiTriageQueue: Queue<AiTriageJobData> | null = null;

export function getAiTriageQueue(): Queue<AiTriageJobData> {
  aiTriageQueue ??= new Queue<AiTriageJobData>(AI_TRIAGE_QUEUE_NAME, {
    connection: getQueueRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 5000,
      },
    },
  });

  return aiTriageQueue;
}

export async function enqueueAiTriageJob(ticketId: string): Promise<void> {
  await getAiTriageQueue().add(
    AI_TRIAGE_JOB_NAME,
    { ticketId },
    { jobId: `ai-triage-ticket-${ticketId}` },
  );
}

export async function closeAiTriageQueue(): Promise<void> {
  await aiTriageQueue?.close();
  aiTriageQueue = null;
}
