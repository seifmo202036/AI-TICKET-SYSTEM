import { Worker } from 'bullmq';

import { env } from '../config/env.js';
import { getWorkerRedisConnection } from '../config/redis.js';
import { pool } from '../db/pool.js';
import { createAiTriageProvider } from '../modules/ai/ai.provider-factory.js';
import { getUrgencyFromPriorityScore } from '../modules/ai/ai.service.js';
import type { AiTriageProvider } from '../modules/ai/ai.types.js';
import {
  completeTicketAiTriage,
  failTicketAiTriage,
  findTicketForAiProcessing,
  insertTicketStatusHistory,
  markTicketAiProcessing,
} from '../modules/tickets/tickets.repository.js';
import {
  AI_TRIAGE_QUEUE_NAME,
  type AiTriageJobData,
} from '../queues/ai-triage.queue.js';

export type AiTriageJobOutcome = 'completed' | 'skipped';

function needsAiProcessing(ticket: Record<string, unknown>): boolean {
  return (
    ticket.deleted_at === null &&
    ticket.status === 'triaging' &&
    (ticket.ai_status === 'queued' || ticket.ai_status === 'processing')
  );
}

export async function processAiTriageJob(
  ticketId: string,
  provider: AiTriageProvider = createAiTriageProvider(),
): Promise<AiTriageJobOutcome> {
  const ticket = await findTicketForAiProcessing(ticketId);

  if (!ticket || !needsAiProcessing(ticket)) {
    console.log(`AI triage job skipped for ticket ${ticketId}`);
    return 'skipped';
  }

  const ticketToProcess = await markTicketAiProcessing(ticketId);

  if (!ticketToProcess) {
    console.log(
      `AI triage job skipped after state check for ticket ${ticketId}`,
    );
    return 'skipped';
  }

  console.log(`AI triage job started for ticket ${ticketId}`);

  const result = await provider.classifyTicket({
    customerIssueType: String(ticketToProcess.customer_issue_type),
    description: String(ticketToProcess.description),
  });
  const urgency = getUrgencyFromPriorityScore(result.priorityScore);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const completedTicket = await completeTicketAiTriage(
      ticketId,
      result,
      urgency,
      client,
    );

    if (!completedTicket) {
      await client.query('COMMIT');
      console.log(
        `AI triage job skipped during completion for ticket ${ticketId}`,
      );
      return 'skipped';
    }

    await insertTicketStatusHistory(ticketId, null, 'triaging', 'open', client);

    await client.query('COMMIT');
    console.log(`AI triage job completed for ticket ${ticketId}`);

    return 'completed';
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back AI triage completion:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function failAiTriageJob(ticketId: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const failedTicket = await failTicketAiTriage(
      ticketId,
      'AI triage could not be completed after all retry attempts.',
      client,
    );

    if (failedTicket) {
      await insertTicketStatusHistory(
        ticketId,
        null,
        'triaging',
        'open',
        client,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Failed to roll back final AI triage failure:',
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export function createAiTriageWorker(): Worker<
  AiTriageJobData,
  AiTriageJobOutcome
> {
  const worker = new Worker<AiTriageJobData, AiTriageJobOutcome>(
    AI_TRIAGE_QUEUE_NAME,
    async (job) => processAiTriageJob(job.data.ticketId),
    {
      connection: getWorkerRedisConnection(),
      concurrency: env.AI_TRIAGE_CONCURRENCY,
    },
  );

  worker.on('failed', (job) => {
    if (!job) {
      console.error('AI triage job failed without a recoverable job payload');
      return;
    }

    const maximumAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade < maximumAttempts) {
      console.log(
        `AI triage job retrying for ticket ${job.data.ticketId} (${job.attemptsMade}/${maximumAttempts})`,
      );
      return;
    }

    void failAiTriageJob(job.data.ticketId)
      .then(() => {
        console.error(
          `AI triage job permanently failed for ticket ${job.data.ticketId}`,
        );
      })
      .catch(() => {
        console.error(
          `Unable to record final AI triage failure for ticket ${job.data.ticketId}`,
        );
      });
  });

  worker.on('error', (error) => {
    console.error(`AI triage worker error: ${error.message}`);
  });

  return worker;
}
