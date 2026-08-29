import { enqueueAiTriageJob } from '../queues/ai-triage.queue.js';
import { findQueuedTicketsForRecovery } from '../modules/tickets/tickets.repository.js';

const RECOVERY_INTERVAL_MS = 60_000;

export async function recoverQueuedAiTriageTickets(): Promise<number> {
  const tickets = await findQueuedTicketsForRecovery();
  let recoveredCount = 0;

  for (const ticket of tickets) {
    try {
      await enqueueAiTriageJob(String(ticket.id));
      recoveredCount += 1;
    } catch {
      console.error(
        `Unable to recover queued AI triage job for ticket ${ticket.id}`,
      );
    }
  }

  if (recoveredCount > 0) {
    console.log(`Recovered ${recoveredCount} queued AI triage job(s)`);
  }

  return recoveredCount;
}

export function startAiTriageRecoveryJob(): () => void {
  const runRecovery = () => {
    void recoverQueuedAiTriageTickets().catch(() => {
      console.error('Queued AI triage recovery failed');
    });
  };

  runRecovery();

  const interval = setInterval(runRecovery, RECOVERY_INTERVAL_MS);
  console.log('Queued AI triage recovery scheduled (runs every minute)');

  return () => clearInterval(interval);
}
