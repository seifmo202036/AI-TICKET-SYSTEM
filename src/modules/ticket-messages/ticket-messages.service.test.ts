import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { PoolClient } from 'pg';

import { pool } from '../../db/pool.js';
import type { AppError } from '../../errors/app-error.js';
import {
  findTicketById,
  findTicketByIdForUpdate,
} from '../tickets/tickets.repository.js';
import { createTicketMessage } from './ticket-messages.service.js';
import { createTicketMessage as createTicketMessageRepository } from './ticket-messages.repository.js';
import { getTicketMessages } from './ticket-messages.service.js';
import {
  createTicketMessageAttachment,
  getTicketMessageAttachments,
  getTicketMessages as getTicketMessagesRepository,
} from './ticket-messages.repository.js';
import {
  createTicketMessageImageUrl,
  deleteTicketMessageImage,
  uploadTicketMessageImage,
} from './ticket-message-image-storage.js';
import type {
  TicketMessage,
  TicketMessageStoredAttachment,
} from './ticket-messages.types.js';

vi.mock('../../db/pool.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('../tickets/tickets.repository.js', () => ({
  findTicketById: vi.fn(),
  findTicketByIdForUpdate: vi.fn(),
}));

vi.mock('./ticket-messages.repository.js', () => ({
  createTicketMessage: vi.fn(),
  createTicketMessageAttachment: vi.fn(),
  getTicketMessageAttachments: vi.fn(),
  getTicketMessages: vi.fn(),
}));

vi.mock('./ticket-message-image-storage.js', () => ({
  uploadTicketMessageImage: vi.fn(),
  deleteTicketMessageImage: vi.fn(),
  createTicketMessageImageUrl: vi.fn(),
}));

const mockedPoolConnect = pool.connect as unknown as Mock;
const mockedFindTicketById = vi.mocked(findTicketById);
const mockedFindTicketByIdForUpdate = vi.mocked(findTicketByIdForUpdate);
const mockedCreateTicketMessageRepository = vi.mocked(
  createTicketMessageRepository,
);
const mockedGetTicketMessagesRepository = vi.mocked(
  getTicketMessagesRepository,
);
const mockedCreateTicketMessageAttachment = vi.mocked(
  createTicketMessageAttachment,
);
const mockedGetTicketMessageAttachments = vi.mocked(
  getTicketMessageAttachments,
);
const mockedUploadTicketMessageImage = vi.mocked(uploadTicketMessageImage);
const mockedDeleteTicketMessageImage = vi.mocked(deleteTicketMessageImage);
const mockedCreateTicketMessageImageUrl = vi.mocked(
  createTicketMessageImageUrl,
);

function createFakeClient(): PoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function buildTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    customer_id: '100',
    assigned_agent_id: '900',
    status: 'assigned',
    ...overrides,
  };
}

function buildMessage(): TicketMessage {
  return {
    id: '1',
    ticketId: '1',
    sender: {
      id: '100',
      userName: 'customer-a',
      role: 'customer' as const,
    },
    body: 'The issue is still happening.',
    attachments: [],
    createdAt: new Date('2026-08-27T00:00:00Z'),
  };
}

function buildStoredAttachment(
  overrides: Partial<TicketMessageStoredAttachment> = {},
): TicketMessageStoredAttachment {
  return {
    id: '8',
    messageId: '1',
    s3Key: 'tickets/1/messages/image.png',
    mimeType: 'image/png',
    fileSizeBytes: 512,
    createdAt: new Date('2026-08-27T00:00:00Z'),
    ...overrides,
  };
}

async function getAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }

  throw new Error('Expected the promise to reject');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPoolConnect.mockResolvedValue(createFakeClient());
  mockedGetTicketMessageAttachments.mockResolvedValue([]);
  mockedDeleteTicketMessageImage.mockResolvedValue();
});

describe('createTicketMessage', () => {
  const messageInput = {
    body: 'The issue is still happening.',
  };

  it('creates a message for the ticket customer inside a transaction', async () => {
    const client = createFakeClient();
    const message = buildMessage();

    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());
    mockedCreateTicketMessageRepository.mockResolvedValueOnce(message);

    const result = await createTicketMessage(
      '1',
      '100',
      'customer',
      messageInput,
    );

    expect(mockedFindTicketByIdForUpdate).toHaveBeenCalledWith('1', client);
    expect(mockedCreateTicketMessageRepository).toHaveBeenCalledWith(
      {
        ticketId: '1',
        senderId: '100',
        body: messageInput.body,
      },
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(result).toBe(message);
  });

  it('creates a message for the assigned agent', async () => {
    const message = buildMessage();
    message.sender = {
      id: '900',
      userName: 'agent-a',
      role: 'agent',
    };

    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());
    mockedCreateTicketMessageRepository.mockResolvedValueOnce(message);

    const result = await createTicketMessage('1', '900', 'agent', messageInput);

    expect(result).toBe(message);
  });

  it('rejects a customer who does not own the ticket', async () => {
    const client = createFakeClient();

    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());

    const error = await getAppError(
      createTicketMessage('1', '200', 'customer', messageInput),
    );

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(mockedCreateTicketMessageRepository).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects an agent who is not assigned to the ticket', async () => {
    const client = createFakeClient();

    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());

    const error = await getAppError(
      createTicketMessage('1', '901', 'agent', messageInput),
    );

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(mockedCreateTicketMessageRepository).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects a message on a closed ticket', async () => {
    const client = createFakeClient();

    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(
      buildTicket({ status: 'closed' }),
    );

    const error = await getAppError(
      createTicketMessage('1', '100', 'customer', messageInput),
    );

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('TICKET_CLOSED');
    expect(mockedCreateTicketMessageRepository).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('returns TICKET_NOT_FOUND when the ticket does not exist', async () => {
    const client = createFakeClient();

    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(null);

    const error = await getAppError(
      createTicketMessage('999', '100', 'customer', messageInput),
    );

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('TICKET_NOT_FOUND');
    expect(mockedCreateTicketMessageRepository).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('creates an image-only message after authorizing the upload', async () => {
    const client = createFakeClient();
    const message = buildMessage();
    message.body = null;
    const image = {
      buffer: Buffer.from('image data'),
      mimeType: 'image/png' as const,
      fileSizeBytes: 10,
    };
    const uploadedImage = {
      s3Key: 'tickets/1/messages/uploaded-image.png',
      mimeType: 'image/png' as const,
      fileSizeBytes: 10,
    };
    const attachment = buildStoredAttachment({
      s3Key: uploadedImage.s3Key,
      fileSizeBytes: uploadedImage.fileSizeBytes,
    });

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedUploadTicketMessageImage.mockResolvedValueOnce(uploadedImage);
    mockedCreateTicketMessageImageUrl.mockResolvedValueOnce(
      'https://signed.example.com/uploaded-image.png',
    );
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());
    mockedCreateTicketMessageRepository.mockResolvedValueOnce(message);
    mockedCreateTicketMessageAttachment.mockResolvedValueOnce(attachment);

    const result = await createTicketMessage('1', '100', 'customer', {}, image);

    expect(mockedFindTicketById).toHaveBeenCalledWith('1');
    expect(mockedUploadTicketMessageImage).toHaveBeenCalledWith('1', image);
    expect(mockedCreateTicketMessageRepository).toHaveBeenCalledWith(
      {
        ticketId: '1',
        senderId: '100',
        body: null,
      },
      client,
    );
    expect(mockedCreateTicketMessageAttachment).toHaveBeenCalledWith(
      {
        messageId: '1',
        s3Key: uploadedImage.s3Key,
        mimeType: 'image/png',
        fileSizeBytes: 10,
      },
      client,
    );
    expect(result.attachments).toEqual([
      {
        id: attachment.id,
        mimeType: 'image/png',
        imageUrl: 'https://signed.example.com/uploaded-image.png',
      },
    ]);
  });

  it('persists both text and an image when the customer sends both', async () => {
    const client = createFakeClient();
    const message = buildMessage();
    const image = {
      buffer: Buffer.from('image data'),
      mimeType: 'image/png' as const,
      fileSizeBytes: 10,
    };
    const uploadedImage = {
      s3Key: 'tickets/1/messages/text-and-image.png',
      mimeType: 'image/png' as const,
      fileSizeBytes: 10,
    };

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedUploadTicketMessageImage.mockResolvedValueOnce(uploadedImage);
    mockedCreateTicketMessageImageUrl.mockResolvedValueOnce(
      'https://signed.example.com/text-and-image.png',
    );
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());
    mockedCreateTicketMessageRepository.mockResolvedValueOnce(message);
    mockedCreateTicketMessageAttachment.mockResolvedValueOnce(
      buildStoredAttachment({ s3Key: uploadedImage.s3Key }),
    );

    await createTicketMessage(
      '1',
      '100',
      'customer',
      { body: 'Please see the screenshot.' },
      image,
    );

    expect(mockedCreateTicketMessageRepository).toHaveBeenCalledWith(
      {
        ticketId: '1',
        senderId: '100',
        body: 'Please see the screenshot.',
      },
      client,
    );
    expect(mockedCreateTicketMessageAttachment).toHaveBeenCalledTimes(1);
  });

  it('does not start a database transaction when the image upload fails', async () => {
    const image = {
      buffer: Buffer.from('image data'),
      mimeType: 'image/jpeg' as const,
      fileSizeBytes: 10,
    };

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedUploadTicketMessageImage.mockRejectedValueOnce(
      new Error('S3 is unavailable'),
    );

    const error = await getAppError(
      createTicketMessage('1', '100', 'customer', {}, image),
    );

    expect(error.message).toBe('S3 is unavailable');
    expect(mockedPoolConnect).not.toHaveBeenCalled();
    expect(mockedCreateTicketMessageRepository).not.toHaveBeenCalled();
    expect(mockedDeleteTicketMessageImage).not.toHaveBeenCalled();
  });

  it('deletes an uploaded image when the database transaction fails', async () => {
    const client = createFakeClient();
    const image = {
      buffer: Buffer.from('image data'),
      mimeType: 'image/webp' as const,
      fileSizeBytes: 10,
    };
    const uploadedImage = {
      s3Key: 'tickets/1/messages/uploaded-image.webp',
      mimeType: 'image/webp' as const,
      fileSizeBytes: 10,
    };

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedUploadTicketMessageImage.mockResolvedValueOnce(uploadedImage);
    mockedCreateTicketMessageImageUrl.mockResolvedValueOnce(
      'https://signed.example.com/uploaded-image.webp',
    );
    mockedPoolConnect.mockResolvedValueOnce(client);
    mockedFindTicketByIdForUpdate.mockResolvedValueOnce(buildTicket());
    mockedCreateTicketMessageRepository.mockRejectedValueOnce(
      new Error('Database write failed'),
    );

    const error = await getAppError(
      createTicketMessage('1', '100', 'customer', {}, image),
    );

    expect(error.message).toBe('Database write failed');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockedDeleteTicketMessageImage).toHaveBeenCalledWith(
      uploadedImage.s3Key,
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rejects a message without text or an image', async () => {
    const error = await getAppError(
      createTicketMessage('1', '100', 'customer', {}),
    );

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('EMPTY_MESSAGE');
    expect(mockedPoolConnect).not.toHaveBeenCalled();
  });
});

describe('getTicketMessages', () => {
  it('returns the customer conversation in chronological order', async () => {
    const newerMessage = buildMessage();
    newerMessage.id = '3';
    newerMessage.createdAt = new Date('2026-08-27T00:03:00Z');

    const olderMessage = buildMessage();
    olderMessage.id = '2';
    olderMessage.createdAt = new Date('2026-08-27T00:02:00Z');

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedGetTicketMessagesRepository.mockResolvedValueOnce([
      newerMessage,
      olderMessage,
    ]);

    const page = await getTicketMessages('1', '100', 'customer', {
      limit: 2,
    });

    expect(mockedFindTicketById).toHaveBeenCalledWith('1');
    expect(mockedGetTicketMessagesRepository).toHaveBeenCalledWith({
      ticketId: '1',
      limit: 3,
      beforeId: null,
    });
    expect(page.messages).toEqual([olderMessage, newerMessage]);
    expect(page.pagination).toEqual({
      limit: 2,
      nextBeforeId: null,
    });
  });

  it('returns a cursor when another page of messages exists', async () => {
    const newestMessage = buildMessage();
    newestMessage.id = '5';

    const middleMessage = buildMessage();
    middleMessage.id = '4';

    const oldestMessage = buildMessage();
    oldestMessage.id = '3';

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedGetTicketMessagesRepository.mockResolvedValueOnce([
      newestMessage,
      middleMessage,
      oldestMessage,
    ]);

    const page = await getTicketMessages('1', '900', 'agent', {
      limit: 2,
      beforeId: '6',
    });

    expect(mockedGetTicketMessagesRepository).toHaveBeenCalledWith({
      ticketId: '1',
      limit: 3,
      beforeId: '6',
    });
    expect(page.messages).toEqual([middleMessage, newestMessage]);
    expect(page.pagination).toEqual({
      limit: 2,
      nextBeforeId: '4',
    });
  });

  it('adds signed image URLs to retrieved message attachments', async () => {
    const message = buildMessage();
    const attachment = buildStoredAttachment({ messageId: message.id });

    mockedFindTicketById.mockResolvedValueOnce(buildTicket());
    mockedGetTicketMessagesRepository.mockResolvedValueOnce([message]);
    mockedGetTicketMessageAttachments.mockResolvedValueOnce([attachment]);
    mockedCreateTicketMessageImageUrl.mockResolvedValueOnce(
      'https://signed.example.com/image.png',
    );

    const page = await getTicketMessages('1', '100', 'customer', {
      limit: 50,
    });

    expect(mockedGetTicketMessageAttachments).toHaveBeenCalledWith(['1']);
    expect(mockedCreateTicketMessageImageUrl).toHaveBeenCalledWith(
      attachment.s3Key,
    );
    expect(page.messages[0]?.attachments).toEqual([
      {
        id: attachment.id,
        mimeType: attachment.mimeType,
        imageUrl: 'https://signed.example.com/image.png',
      },
    ]);
  });

  it('rejects an agent who is not assigned to the ticket', async () => {
    mockedFindTicketById.mockResolvedValueOnce(buildTicket());

    const error = await getAppError(
      getTicketMessages('1', '901', 'agent', { limit: 50 }),
    );

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(mockedGetTicketMessagesRepository).not.toHaveBeenCalled();
  });

  it('returns TICKET_NOT_FOUND when the ticket does not exist', async () => {
    mockedFindTicketById.mockResolvedValueOnce(null);

    const error = await getAppError(
      getTicketMessages('999', '100', 'customer', { limit: 50 }),
    );

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('TICKET_NOT_FOUND');
    expect(mockedGetTicketMessagesRepository).not.toHaveBeenCalled();
  });
});
