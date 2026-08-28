import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  createTicketMessageController,
  getTicketMessagesController,
} from './ticket-messages.controller.js';
import {
  createTicketMessage,
  getTicketMessages,
} from './ticket-messages.service.js';
import type {
  TicketMessage,
  TicketMessagePage,
} from './ticket-messages.types.js';

vi.mock('./ticket-messages.service.js', () => ({
  createTicketMessage: vi.fn(),
  getTicketMessages: vi.fn(),
}));

const mockedCreateTicketMessage = vi.mocked(createTicketMessage);
const mockedGetTicketMessages = vi.mocked(getTicketMessages);

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
    file: undefined,
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

describe('createTicketMessageController', () => {
  const validBody = {
    body: 'The issue is still happening.',
  };

  const createdMessage: TicketMessage = {
    id: '1',
    ticketId: '1',
    sender: {
      id: '100',
      userName: 'customer-a',
      role: 'customer',
    },
    body: validBody.body,
    attachments: [],
    createdAt: new Date('2026-08-27T00:00:00Z'),
  };

  it('creates a message and responds with 201', async () => {
    mockedCreateTicketMessage.mockResolvedValueOnce(createdMessage);

    const req = createMockRequest({
      body: validBody,
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    expect(mockedCreateTicketMessage).toHaveBeenCalledWith(
      '1',
      '100',
      'customer',
      validBody,
      undefined,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: createdMessage });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a trimmed message body to the service', async () => {
    mockedCreateTicketMessage.mockResolvedValueOnce(createdMessage);

    const req = createMockRequest({
      body: { body: '  The issue is still happening.  ' },
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    expect(mockedCreateTicketMessage).toHaveBeenCalledWith(
      '1',
      '100',
      'customer',
      validBody,
      undefined,
    );
  });

  it('passes an uploaded image to the service for an image-only message', async () => {
    const image = {
      buffer: Buffer.from('image data'),
      mimetype: 'image/png',
      size: 10,
    } as Express.Multer.File;
    const imageMessage: TicketMessage = {
      ...createdMessage,
      body: null,
      attachments: [
        {
          id: '8',
          mimeType: 'image/png',
          imageUrl: 'https://signed.example.com/image.png',
        },
      ],
    };

    mockedCreateTicketMessage.mockResolvedValueOnce(imageMessage);

    const req = createMockRequest({
      body: {},
      file: image,
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    expect(mockedCreateTicketMessage).toHaveBeenCalledWith(
      '1',
      '100',
      'customer',
      {},
      {
        buffer: image.buffer,
        mimeType: 'image/png',
        fileSizeBytes: 10,
      },
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: imageMessage });
  });

  it.each(['abc', '', '1.5', '-1'])(
    'responds with INVALID_TICKET_ID for ticket id: %s',
    async (ticketId) => {
      const req = createMockRequest({
        body: validBody,
        params: { ticketId },
        auth: { userId: '100', role: 'customer' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      await createTicketMessageController(req, res, next);

      const error = getNextError(next) as AppError;

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_TICKET_ID');
      expect(mockedCreateTicketMessage).not.toHaveBeenCalled();
    },
  );

  it('responds with VALIDATION_ERROR for an invalid message body', async () => {
    const req = createMockRequest({
      body: { body: '   ' },
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(mockedCreateTicketMessage).not.toHaveBeenCalled();
  });

  it('responds with UNAUTHENTICATED when authentication is absent', async () => {
    const req = createMockRequest({
      body: validBody,
      params: { ticketId: '1' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(mockedCreateTicketMessage).not.toHaveBeenCalled();
  });

  it('forwards service errors to the error middleware', async () => {
    mockedCreateTicketMessage.mockRejectedValueOnce(
      new AppError(409, 'This ticket is closed', 'TICKET_CLOSED'),
    );

    const req = createMockRequest({
      body: validBody,
      params: { ticketId: '1' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await createTicketMessageController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.code).toBe('TICKET_CLOSED');
  });
});

describe('getTicketMessagesController', () => {
  const messagePage: TicketMessagePage = {
    messages: [],
    pagination: {
      limit: 50,
      nextBeforeId: null,
    },
  };

  it('gets the authorized ticket conversation', async () => {
    mockedGetTicketMessages.mockResolvedValueOnce(messagePage);

    const req = createMockRequest({
      params: { ticketId: '1' },
      query: { limit: '25', beforeId: '180' },
      auth: { userId: '900', role: 'agent' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketMessagesController(req, res, next);

    expect(mockedGetTicketMessages).toHaveBeenCalledWith('1', '900', 'agent', {
      limit: 25,
      beforeId: '180',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(messagePage);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds with the default pagination values', async () => {
    mockedGetTicketMessages.mockResolvedValueOnce(messagePage);

    const req = createMockRequest({
      params: { ticketId: '1' },
      query: {},
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketMessagesController(req, res, next);

    expect(mockedGetTicketMessages).toHaveBeenCalledWith(
      '1',
      '100',
      'customer',
      { limit: 50 },
    );
  });

  it('responds with VALIDATION_ERROR for invalid query parameters', async () => {
    const req = createMockRequest({
      params: { ticketId: '1' },
      query: { limit: '100' },
      auth: { userId: '100', role: 'customer' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketMessagesController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(mockedGetTicketMessages).not.toHaveBeenCalled();
  });

  it('responds with UNAUTHENTICATED when authentication is absent', async () => {
    const req = createMockRequest({
      params: { ticketId: '1' },
      query: {},
    });
    const res = createMockResponse();
    const next = vi.fn();

    await getTicketMessagesController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(mockedGetTicketMessages).not.toHaveBeenCalled();
  });
});
