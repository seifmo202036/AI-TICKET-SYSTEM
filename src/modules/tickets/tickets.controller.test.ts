import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  createTicketController,
  getCustomerTicketsController,
  getTicketByIdController,
  getTicketQueueController,
  claimTicketController,
  getAssignedTicketsController,
  resolveTicketController,
  closeTicketController,
} from './tickets.controller.js';
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

vi.mock('./tickets.service.js', () => ({
  createTicket: vi.fn(),
  getCustomerTickets: vi.fn(),
  getTicketById: vi.fn(),
  getTicketQueue: vi.fn(),
  claimTicket: vi.fn(),
  getAssignedTickets: vi.fn(),
  resolveTicket: vi.fn(),
  closeTicket: vi.fn(),
}));

const mockedCreateTicket = vi.mocked(createTicket);
const mockedGetCustomerTickets = vi.mocked(getCustomerTickets);
const mockedGetTicketById = vi.mocked(getTicketById);
const mockedGetTicketQueue = vi.mocked(getTicketQueue);
const mockedClaimTicket = vi.mocked(claimTicket);
const mockedGetAssignedTickets = vi.mocked(getAssignedTickets);
const mockedResolveTicket = vi.mocked(resolveTicket);
const mockedCloseTicket = vi.mocked(closeTicket);

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

function createMockRequest(overrides: Partial<Request> = {}) {
  return {
    body: {},
    params: {},
    auth: undefined,
    ...overrides,
  } as Request;
}

function getNextError(next: NextFunction): unknown {
  expect(next).toHaveBeenCalledTimes(1);

  return vi.mocked(next).mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTicketController', () => {
  const validBody = {
    customerIssueType: 'payment',
    description: 'I was charged twice for the same subscription.',
  };

  it('creates a ticket and responds with 201', async () => {
    const row = { id: '1', ...validBody };
    mockedCreateTicket.mockResolvedValueOnce(row as never);

    const req = createMockRequest({ body: validBody, auth: { userId: '100', role: 'customer' } });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketController(req, res, next);

    expect(mockedCreateTicket).toHaveBeenCalledWith(validBody, '100');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ticket created successfully',
      ticket: row,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes the trimmed description to the service', async () => {
    mockedCreateTicket.mockResolvedValueOnce({ id: '1' } as never);

    const req = createMockRequest({
      body: { ...validBody, description: `  ${validBody.description}  ` },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketController(req, res, next);

    expect(mockedCreateTicket).toHaveBeenCalledWith(
      { ...validBody, description: validBody.description },
      '100',
    );
  });

  it.each([
    ['missing description', { customerIssueType: 'payment' }],
    ['empty description', { customerIssueType: 'payment', description: '' }],
    ['unknown issue type', { customerIssueType: 'hacking', description: 'hi' }],
    ['extra property', { ...validBody, status: 'closed' }],
  ])('responds with 400 VALIDATION_ERROR for %s', async (_name, body) => {
    const req = createMockRequest({ body, auth: { userId: '100', role: 'customer' } });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds with 401 when there is no authenticated user', async () => {
    const req = createMockRequest({ body: validBody });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(mockedCreateTicket).not.toHaveBeenCalled();
  });

  it('forwards service errors to the error middleware', async () => {
    mockedCreateTicket.mockRejectedValueOnce(
      new AppError(500, 'Unable to create ticket', 'TICKET_CREATION_FAILED'),
    );

    const req = createMockRequest({ body: validBody, auth: { userId: '100', role: 'customer' } });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.code).toBe('TICKET_CREATION_FAILED');
  });
});

describe('getCustomerTicketsController', () => {
  it("responds with the customer's tickets", async () => {
    const rows = [{ id: '1' }, { id: '2' }];
    mockedGetCustomerTickets.mockResolvedValueOnce(rows as never);

    const req = createMockRequest({ auth: { userId: '100', role: 'customer' } });
    const res = createMockResponse();
    const next = vi.fn();

    await getCustomerTicketsController(req, res, next);

    expect(mockedGetCustomerTickets).toHaveBeenCalledWith('100');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tickets: rows });
  });

  it('responds with 401 when there is no authenticated user', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getCustomerTicketsController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedGetCustomerTickets).not.toHaveBeenCalled();
  });
});

describe('getTicketByIdController', () => {
  it('responds with a single ticket', async () => {
    const row = { id: '1', customer_id: '100' };
    mockedGetTicketById.mockResolvedValueOnce(row as never);

    const req = createMockRequest({
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketByIdController(req, res, next);

    expect(mockedGetTicketById).toHaveBeenCalledWith('1', '100', 'customer');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ticket: row });
  });

  it.each(['abc', '', '12ab', '-1', '1.5'])(
    'responds with 400 INVALID_TICKET_ID for ticket id: %s',
    async (ticketId) => {
      const req = createMockRequest({
        params: { ticketId },
        auth: { userId: '100', role: 'customer' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      await getTicketByIdController(req, res, next);

      const error = getNextError(next) as AppError;

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_TICKET_ID');
      expect(mockedGetTicketById).not.toHaveBeenCalled();
    },
  );

  it('responds with 401 when there is no authenticated user', async () => {
    const req = createMockRequest({ params: { ticketId: '1' } });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketByIdController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedGetTicketById).not.toHaveBeenCalled();
  });
});

describe('getTicketQueueController', () => {
  it('responds with the open tickets queue', async () => {
    const rows = [{ id: '1', status: 'open' }, { id: '2', status: 'open' }];
    mockedGetTicketQueue.mockResolvedValueOnce(rows as never);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketQueueController(req, res, next);

    expect(mockedGetTicketQueue).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tickets: rows });
  });

  it('forwards repository errors to the error middleware', async () => {
    mockedGetTicketQueue.mockRejectedValueOnce(
      new AppError(500, 'Unable to get ticket queue', 'DB_GET_TICKET_QUEUE_FAILED'),
    );

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketQueueController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.code).toBe('DB_GET_TICKET_QUEUE_FAILED');
  });
});

describe('claimTicketController', () => {
  it('claims a ticket and responds with 200', async () => {
    const claimed = { id: '1', status: 'assigned' };
    mockedClaimTicket.mockResolvedValueOnce(claimed as never);

    const req = createMockRequest({
      params: { ticketId: '1' },
      auth: { userId: '900', role: 'agent' },
    } as Partial<Request>);
    const res = createMockResponse();
    const next = vi.fn();

    await claimTicketController(req, res, next);

    expect(mockedClaimTicket).toHaveBeenCalledWith('1', '900');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ticket claimed successfully',
      ticket: claimed,
    });
  });

  it.each(['abc', '', '12ab'])(
    'responds with 400 INVALID_TICKET_ID for ticket id: %s',
    async (ticketId) => {
      const req = createMockRequest({
        params: { ticketId },
        auth: { userId: '900', role: 'agent' },
      } as Partial<Request>);
      const res = createMockResponse();
      const next = vi.fn();

      await claimTicketController(req, res, next);

      const error = getNextError(next) as AppError;

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_TICKET_ID');
      expect(mockedClaimTicket).not.toHaveBeenCalled();
    },
  );

  it('responds with 401 when there is no authenticated agent', async () => {
    const req = createMockRequest({ params: { ticketId: '1' } });
    const res = createMockResponse();
    const next = vi.fn();

    await claimTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedClaimTicket).not.toHaveBeenCalled();
  });
});

describe('getAssignedTicketsController', () => {
  it("responds with the agent's assigned tickets", async () => {
    const rows = [{ id: '1', status: 'assigned' }];
    mockedGetAssignedTickets.mockResolvedValueOnce(rows as never);

    const req = createMockRequest({
      auth: { userId: '900', role: 'agent' },
    } as Partial<Request>);
    const res = createMockResponse();
    const next = vi.fn();

    await getAssignedTicketsController(req, res, next);

    expect(mockedGetAssignedTickets).toHaveBeenCalledWith('900');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ tickets: rows });
  });

  it('responds with 401 when there is no authenticated agent', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getAssignedTicketsController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedGetAssignedTickets).not.toHaveBeenCalled();
  });
});

describe('resolveTicketController', () => {
  it('resolves a ticket and responds with 200', async () => {
    const resolved = { id: '1', status: 'resolved' };
    mockedResolveTicket.mockResolvedValueOnce(resolved as never);

    const req = createMockRequest({
      params: { ticketId: '1' },
      auth: { userId: '900', role: 'agent' },
    } as Partial<Request>);
    const res = createMockResponse();
    const next = vi.fn();

    await resolveTicketController(req, res, next);

    expect(mockedResolveTicket).toHaveBeenCalledWith('1', '900');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ticket resolved successfully',
      ticket: resolved,
    });
  });

  it('responds with 401 when there is no authenticated agent', async () => {
    const req = createMockRequest({ params: { ticketId: '1' } });
    const res = createMockResponse();
    const next = vi.fn();

    await resolveTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedResolveTicket).not.toHaveBeenCalled();
  });
});

describe('closeTicketController', () => {
  it('closes a ticket and responds with 200', async () => {
    const closed = { id: '1', status: 'closed' };
    mockedCloseTicket.mockResolvedValueOnce(closed as never);

    const req = createMockRequest({
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    } as Partial<Request>);
    const res = createMockResponse();
    const next = vi.fn();

    await closeTicketController(req, res, next);

    expect(mockedCloseTicket).toHaveBeenCalledWith('1', '100');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ticket closed successfully',
      ticket: closed,
    });
  });

  it.each(['abc', '', '-1'])(
    'responds with 400 INVALID_TICKET_ID for ticket id: %s',
    async (ticketId) => {
      const req = createMockRequest({
        params: { ticketId },
        auth: { userId: '100', role: 'customer' },
      } as Partial<Request>);
      const res = createMockResponse();
      const next = vi.fn();

      await closeTicketController(req, res, next);

      const error = getNextError(next) as AppError;

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_TICKET_ID');
      expect(mockedCloseTicket).not.toHaveBeenCalled();
    },
  );

  it('responds with 401 when there is no authenticated customer', async () => {
    const req = createMockRequest({ params: { ticketId: '1' } });
    const res = createMockResponse();
    const next = vi.fn();

    await closeTicketController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(mockedCloseTicket).not.toHaveBeenCalled();
  });
});
