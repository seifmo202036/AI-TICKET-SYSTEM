import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { Mock } from 'vitest';
import type { PoolClient } from 'pg';

import { AppError } from '../errors/app-error.js';
import { pool } from '../db/pool.js';
import {
  runAutoCloseExpiredResolvedTickets,
  startAutoCloseJob,
} from './auto-close-tickets.job.js';
import {
  autoCloseExpiredResolvedTickets,
  insertTicketStatusHistory,
} from '../modules/tickets/tickets.repository.js';
import cron from 'node-cron';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}));

vi.mock('../db/pool.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('../modules/tickets/tickets.repository.js', () => ({
  autoCloseExpiredResolvedTickets: vi.fn(),
  insertTicketStatusHistory: vi.fn(),
}));

const mockedAutoClose = vi.mocked(autoCloseExpiredResolvedTickets);
const mockedInsertHistory = vi.mocked(insertTicketStatusHistory);

function createFakeClient(): PoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

// pg Pool.connect has overloads, so the mock handle needs an explicit type
const mockedPoolConnect = pool.connect as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockedPoolConnect.mockResolvedValue(createFakeClient());
});

describe('runAutoCloseExpiredResolvedTickets', () => {
  it('closes expired tickets and records system history rows', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);

    const expiredTickets = [{ id: '1' }, { id: '2' }, { id: '3' }];
    mockedAutoClose.mockResolvedValueOnce(expiredTickets);

    const closedCount = await runAutoCloseExpiredResolvedTickets();

    expect(mockedAutoClose).toHaveBeenCalledWith(client);
    expect(mockedInsertHistory).toHaveBeenCalledTimes(3);
    expect(mockedInsertHistory).toHaveBeenCalledWith(
      '1',
      null,
      'resolved',
      'closed',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(closedCount).toBe(3);
  });

  it('returns zero when no ticket stayed resolved for more than 48 hours', async () => {
    mockedAutoClose.mockResolvedValueOnce([]);

    const closedCount = await runAutoCloseExpiredResolvedTickets();

    expect(closedCount).toBe(0);
    expect(mockedInsertHistory).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when a history insert fails', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);

    mockedAutoClose.mockResolvedValueOnce([{ id: '1' }]);
    mockedInsertHistory.mockRejectedValueOnce(
      new AppError(500, 'history insert failed', 'DB_INSERT_FAILED'),
    );

    try {
      await runAutoCloseExpiredResolvedTickets();
      throw new Error('Expected the promise to reject');
    } catch (error) {
      expect((error as AppError).code).toBe('DB_INSERT_FAILED');
    }

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  });
});

describe('startAutoCloseJob', () => {
  it('schedules the sweep to run every hour', () => {
    startAutoCloseJob();

    expect(cron.schedule).toHaveBeenCalledWith(
      '0 * * * *',
      expect.any(Function),
    );
  });
});
