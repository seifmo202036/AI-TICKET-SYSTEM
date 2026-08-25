import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { Mock } from 'vitest';
import type { PoolClient } from 'pg';
import { AppError } from '../../errors/app-error.js';
import { pool } from '../../db/pool.js';
import {
  createTicket,
  getCustomerTickets,
  getTicketById,
  getTicketQueue,
  claimTicket,
  getAssignedTickets,
  resolveTicket,
  closeTicket,
} from './tickets.service.js';
import {
  createTicket as createTicketRepo,
  findTicketById,
  getCustomerTickets as getCustomerTicketsRepo,
  getTicketQueue as getTicketQueueRepo,
  findTicketByIdForUpdate,
  claimTicket as claimTicketRepo,
  resolveTicket as resolveTicketRepo,
  closeTicket as closeTicketRepo,
  insertTicketStatusHistory,
  getAssignedTickets as getAssignedTicketsRepo,
} from './tickets.repository.js';

vi.mock('../../db/pool.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('./tickets.repository.js', () => ({
  createTicket: vi.fn(),
  findTicketById: vi.fn(),
  getCustomerTickets: vi.fn(),
  getTicketQueue: vi.fn(),
  findTicketByIdForUpdate: vi.fn(),
  claimTicket: vi.fn(),
  resolveTicket: vi.fn(),
  closeTicket: vi.fn(),
  insertTicketStatusHistory: vi.fn(),
  getAssignedTickets: vi.fn(),
}));

const mockedCreateTicketRepo = vi.mocked(createTicketRepo);
const mockedFindTicketById = vi.mocked(findTicketById);
const mockedGetCustomerTicketsRepo = vi.mocked(getCustomerTicketsRepo);
const mockedGetTicketQueueRepo = vi.mocked(getTicketQueueRepo);
const mockedFindTicketByIdForUpdate = vi.mocked(findTicketByIdForUpdate);
const mockedClaimTicketRepo = vi.mocked(claimTicketRepo);
const mockedResolveTicketRepo = vi.mocked(resolveTicketRepo);
const mockedCloseTicketRepo = vi.mocked(closeTicketRepo);
const mockedInsertTicketStatusHistory = vi.mocked(insertTicketStatusHistory);
const mockedGetAssignedTicketsRepo = vi.mocked(getAssignedTicketsRepo);

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

function buildTicketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    customer_id: '100',
    assigned_agent_id: null,
    customer_issue_type: 'payment',
    description: 'I was charged twice.',
    status: 'triaging',
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function getAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }

  throw new Error('Expected the promise to reject');
}

describe('createTicket', () => {
  const input = {
    customerIssueType: 'payment' as const,
    description: 'I was charged twice.',
  };

  it('creates a ticket for the authenticated customer', async () => {
    const row = buildTicketRow();
    mockedCreateTicketRepo.mockResolvedValueOnce(row);

    const ticket = await createTicket(input, '100');

    expect(mockedCreateTicketRepo).toHaveBeenCalledWith(input, '100');
    expect(ticket).toBe(row);
  });

  it('throws TICKET_CREATION_FAILED when the repository returns nothing', async () => {
    mockedCreateTicketRepo.mockResolvedValueOnce(null as never);

    const error = await getAppError(createTicket(input, '100'));

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('TICKET_CREATION_FAILED');
  });
});

describe('getCustomerTickets', () => {
  it("returns the customer's tickets from the repository", async () => {
    const rows = [buildTicketRow(), buildTicketRow({ id: '2' })];
    mockedGetCustomerTicketsRepo.mockResolvedValueOnce(rows);

    const tickets = await getCustomerTickets('100');

    expect(mockedGetCustomerTicketsRepo).toHaveBeenCalledWith('100');
    expect(tickets).toEqual(rows);
  });
});

describe('getTicketById', () => {
  it('throws TICKET_NOT_FOUND when the ticket does not exist', async () => {
    mockedFindTicketById.mockResolvedValueOnce(null);

    const error = await getAppError(getTicketById('999', '100', 'customer'));

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('TICKET_NOT_FOUND');
  });

  it('lets a customer see his own ticket', async () => {
    const row = buildTicketRow({ customer_id: '100' });
    mockedFindTicketById.mockResolvedValueOnce(row);

    const ticket = await getTicketById('1', '100', 'customer');

    expect(ticket).toBe(row);
  });

  it('forbids a customer from seeing another customer ticket', async () => {
    mockedFindTicketById.mockResolvedValueOnce(
      buildTicketRow({ customer_id: '200' }),
    );

    const error = await getAppError(getTicketById('1', '100', 'customer'));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('You are not allowed to access this ticket');
    expect(error.code).toBe('FORBIDDEN');
  });

  it('lets an agent see an open unassigned ticket', async () => {
    const row = buildTicketRow({
      status: 'open',
      assigned_agent_id: null,
    });
    mockedFindTicketById.mockResolvedValueOnce(row);

    const ticket = await getTicketById('1', '900', 'agent');

    expect(ticket).toBe(row);
  });

  it('lets an agent see a ticket assigned to him', async () => {
    const row = buildTicketRow({
      status: 'assigned',
      assigned_agent_id: '900',
    });
    mockedFindTicketById.mockResolvedValueOnce(row);

    const ticket = await getTicketById('1', '900', 'agent');

    expect(ticket).toBe(row);
  });

  it('forbids an agent from seeing another agent assigned ticket', async () => {
    mockedFindTicketById.mockResolvedValueOnce(
      buildTicketRow({
        status: 'assigned',
        assigned_agent_id: '901',
      }),
    );

    const error = await getAppError(getTicketById('1', '900', 'agent'));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('You are not allowed to access this ticket');
  });

  it('forbids an unknown role', async () => {
    mockedFindTicketById.mockResolvedValueOnce(buildTicketRow());

    const error = await getAppError(getTicketById('1', '100', 'admin'));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Forbidden');
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('getTicketQueue', () => {
  it('returns the open tickets from the repository', async () => {
    const rows = [
      buildTicketRow({ status: 'open' }),
      buildTicketRow({ id: '2', status: 'open' }),
    ];
    mockedGetTicketQueueRepo.mockResolvedValueOnce(rows);

    const tickets = await getTicketQueue();

    expect(mockedGetTicketQueueRepo).toHaveBeenCalledTimes(1);
    expect(tickets).toEqual(rows);
  });
});

describe('claimTicket', () => {
  it('claims an open unassigned ticket inside a transaction', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);

    const locked = buildTicketRow({ status: 'open' });
    const claimed = buildTicketRow({
      status: 'assigned',
      assigned_agent_id: '900',
    });
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(locked);
    mockedClaimTicketRepo.mockResolvedValueOnce(claimed);

    const ticket = await claimTicket('1', '900');

    expect(mockedFindTicketByIdForUpdate).toHaveBeenCalledWith('1', client);
    expect(mockedClaimTicketRepo).toHaveBeenCalledWith('1', '900', client);
    expect(mockedInsertTicketStatusHistory).toHaveBeenCalledWith(
      '1',
      '900',
      'open',
      'assigned',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(ticket).toBe(claimed);
  });

  it('rolls back and throws TICKET_NOT_FOUND when the ticket does not exist', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(null);

    const error = await getAppError(claimTicket('999', '900'));

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('TICKET_NOT_FOUND');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockedClaimTicketRepo).not.toHaveBeenCalled();
  });

  it.each([
    buildTicketRow({ status: 'assigned', assigned_agent_id: '901' }),
    buildTicketRow({ status: 'resolved', assigned_agent_id: null }),
  ])('throws TICKET_NOT_CLAIMABLE when the ticket is no longer claimable', async (locked) => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(locked);

    const error = await getAppError(claimTicket('1', '900'));

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('TICKET_NOT_CLAIMABLE');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockedClaimTicketRepo).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when the history insert fails', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicketRow({ status: 'open' }),
    );
    mockedInsertTicketStatusHistory.mockRejectedValueOnce(
      new AppError(500, 'history insert failed', 'DB_INSERT_FAILED'),
    );

    const error = await getAppError(claimTicket('1', '900'));

    expect(error.code).toBe('DB_INSERT_FAILED');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  });
});

describe('getAssignedTickets', () => {
  it("returns the agent's assigned tickets from the repository", async () => {
    const rows = [
      buildTicketRow({ status: 'assigned', assigned_agent_id: '900' }),
    ];
    mockedGetAssignedTicketsRepo.mockResolvedValueOnce(rows);

    const tickets = await getAssignedTickets('900');

    expect(mockedGetAssignedTicketsRepo).toHaveBeenCalledWith('900');
    expect(tickets).toEqual(rows);
  });
});

describe('resolveTicket', () => {
  it('resolves the ticket for the assigned agent inside a transaction', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);

    const locked = buildTicketRow({
      status: 'assigned',
      assigned_agent_id: '900',
    });
    const resolved = buildTicketRow({
      status: 'resolved',
      assigned_agent_id: '900',
    });
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(locked);
    mockedResolveTicketRepo.mockResolvedValueOnce(resolved);

    const ticket = await resolveTicket('1', '900');

    expect(mockedResolveTicketRepo).toHaveBeenCalledWith('1', client);
    expect(mockedInsertTicketStatusHistory).toHaveBeenCalledWith(
      '1',
      '900',
      'assigned',
      'resolved',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(ticket).toBe(resolved);
  });

  it('forbids an agent who is not assigned to the ticket', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicketRow({
        status: 'assigned',
        assigned_agent_id: '901',
      }),
    );

    const error = await getAppError(resolveTicket('1', '900'));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe(
      'Only the assigned agent can resolve this ticket',
    );
    expect(mockedResolveTicketRepo).not.toHaveBeenCalled();
  });

  it('throws TICKET_NOT_RESOLVABLE when the ticket is not assigned', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicketRow({
        status: 'open',
        assigned_agent_id: '900',
      }),
    );

    const error = await getAppError(resolveTicket('1', '900'));

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('TICKET_NOT_RESOLVABLE');
  });
});

describe('closeTicket', () => {
  it('closes his resolved ticket for the owning customer inside a transaction', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);

    const locked = buildTicketRow({
      customer_id: '100',
      status: 'resolved',
    });
    const closed = buildTicketRow({
      customer_id: '100',
      status: 'closed',
    });
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(locked);
    mockedCloseTicketRepo.mockResolvedValueOnce(closed);

    const ticket = await closeTicket('1', '100');

    expect(mockedCloseTicketRepo).toHaveBeenCalledWith('1', client);
    expect(mockedInsertTicketStatusHistory).toHaveBeenCalledWith(
      '1',
      '100',
      'resolved',
      'closed',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(ticket).toBe(closed);
  });

  it('forbids a customer who does not own the ticket', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicketRow({
        customer_id: '200',
        status: 'resolved',
      }),
    );

    const error = await getAppError(closeTicket('1', '100'));

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('You are not allowed to access this ticket');
    expect(mockedCloseTicketRepo).not.toHaveBeenCalled();
  });

  it('throws TICKET_NOT_CLOSABLE when the ticket is not resolved yet', async () => {
    const client = createFakeClient();
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicketRow({
        customer_id: '100',
        status: 'assigned',
      }),
    );

    const error = await getAppError(closeTicket('1', '100'));

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('TICKET_NOT_CLOSABLE');
  });
});
