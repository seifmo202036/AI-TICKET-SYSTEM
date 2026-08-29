import { AI_ENABLED } from './config/env.js';
import { closeRedisConnections } from './config/redis.js';
import { pool, verifyDatabaseConnection } from './db/pool.js';
import { startAiTriageRecoveryJob } from './jobs/recover-ai-triage.job.js';
import { closeAiTriageQueue } from './queues/ai-triage.queue.js';
import { createAiTriageWorker } from './workers/ai-triage.worker.js';

async function startWorker(): Promise<void> {
  try {
    await verifyDatabaseConnection();
    console.log('Database connection established');

    if (!AI_ENABLED) {
      console.log('AI triage worker not started because AI is not configured');
      await pool.end();
      return;
    }

    const worker = createAiTriageWorker();
    const stopRecovery = startAiTriageRecoveryJob();

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}; stopping AI triage worker`);
      stopRecovery();
      await worker.close();
      await closeAiTriageQueue();
      await closeRedisConnections();
      await pool.end();
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (error) {
    console.error('AI worker failed to start:', error);
    process.exit(1);
  }
}

void startWorker();
