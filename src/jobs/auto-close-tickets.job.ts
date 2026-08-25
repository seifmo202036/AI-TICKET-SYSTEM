import cron from 'node-cron';

import { pool } from '../db/pool.js';
import {
  autoCloseExpiredResolvedTickets,
  insertTicketStatusHistory,
} from '../modules/tickets/tickets.repository.js';

// Resolved tickets left hanging are closed automatically by the system
const AUTO_CLOSE_AFTER_HOURS = 48;
const AUTO_CLOSE_CRON = '0 * * * *'; // every hour

// changed_by is NULL here because the system itself closes the ticket
export async function runAutoCloseExpiredResolvedTickets(): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const expiredTickets = await autoCloseExpiredResolvedTickets(client);

    for (const ticket of expiredTickets) {
      await insertTicketStatusHistory(
        ticket.id,
        null,
        'resolved',
        'closed',
        client,
      );
    }

    await client.query('COMMIT');

    return expiredTickets.length;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Failed to roll back the auto close tickets job:',
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export function startAutoCloseJob(): void {
  cron.schedule(AUTO_CLOSE_CRON, () => {
    runAutoCloseExpiredResolvedTickets()
      .then((closedCount) => {
        if (closedCount > 0) {
          console.log(
            `Auto closed ${closedCount} ticket(s) that stayed resolved for more than ${AUTO_CLOSE_AFTER_HOURS} hours`,
          );
        }
      })
      .catch((error) => {
        console.error('Auto close tickets job failed:', error);
      });
  });

  console.log('Auto close tickets job scheduled (runs every hour)');
}
