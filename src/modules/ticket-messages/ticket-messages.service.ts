import type { PoolClient } from 'pg';

import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';
import {
  findTicketById,
  findTicketByIdForUpdate,
} from '../tickets/tickets.repository.js';
import {
  createTicketMessageAttachment,
  createTicketMessage as createTicketMessageRepository,
  getTicketMessageAttachments,
  getTicketMessages as getTicketMessagesRepository,
} from './ticket-messages.repository.js';
import {
  createTicketMessageImageUrl,
  deleteTicketMessageImage,
  uploadTicketMessageImage,
} from './ticket-message-image-storage.js';
import {
  isTicketMessageImageMimeType,
  MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES,
} from './ticket-message-images.js';
import type {
  TicketMessage,
  TicketMessageImage,
  TicketMessagePage,
  TicketMessageStoredAttachment,
} from './ticket-messages.types.js';
import type {
  CreateMessageInput,
  GetMessagesQuery,
} from './ticket-messages.validation.js';
import type { UserId, UserRole } from '../users/user.types.js';

export async function createTicketMessage(
  ticketId: string,
  senderId: UserId,
  role: UserRole,
  messageInput: CreateMessageInput,
  image?: TicketMessageImage,
): Promise<TicketMessage> {
  ensureMessageIsNotEmpty(messageInput, image);
  ensureImageIsValid(image);

  let uploadedImage: {
    s3Key: string;
    mimeType: TicketMessageImage['mimeType'];
    fileSizeBytes: number;
  } | null = null;
  let imageUrl: string | null = null;
  let client: PoolClient | null = null;

  try {
    if (image) {
      // This inexpensive preflight avoids uploading an image for an account
      // that cannot participate in this ticket's conversation.
      const ticket = await findTicketById(ticketId);

      ensureTicketExists(ticket);
      ensureParticipantCanAccessTicketMessages(ticket, senderId, role);
      ensureTicketCanReceiveMessages(ticket);

      uploadedImage = await uploadTicketMessageImage(ticketId, image);
      imageUrl = await createTicketMessageImageUrl(uploadedImage.s3Key);
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // Re-check inside the transaction so ticket closure or reassignment cannot
    // race with the image upload that occurred before this transaction began.
    const ticket = await findTicketByIdForUpdate(ticketId, client);

    ensureTicketExists(ticket);
    ensureParticipantCanAccessTicketMessages(ticket, senderId, role);
    ensureTicketCanReceiveMessages(ticket);

    const message = await createTicketMessageRepository(
      {
        ticketId,
        senderId,
        body: messageInput.body ?? null,
      },
      client,
    );

    if (!message) {
      throw new AppError(
        500,
        'Unable to create ticket message',
        'TICKET_MESSAGE_CREATION_FAILED',
      );
    }

    if (uploadedImage) {
      if (!imageUrl) {
        throw new AppError(
          500,
          'Unable to create an image URL for this ticket message',
          'S3_SIGN_TICKET_MESSAGE_IMAGE_FAILED',
        );
      }

      const attachment = await createTicketMessageAttachment(
        {
          messageId: message.id,
          s3Key: uploadedImage.s3Key,
          mimeType: uploadedImage.mimeType,
          fileSizeBytes: uploadedImage.fileSizeBytes,
        },
        client,
      );

      if (!attachment) {
        throw new AppError(
          500,
          'Unable to create ticket message attachment',
          'TICKET_MESSAGE_ATTACHMENT_CREATION_FAILED',
        );
      }

      message.attachments = [
        {
          id: attachment.id,
          mimeType: attachment.mimeType,
          imageUrl,
        },
      ];
    }

    await client.query('COMMIT');

    return message;
  } catch (error) {
    if (client) {
      await rollBackTicketMessageTransaction(client);
    }

    if (uploadedImage) {
      await deleteUploadedImageAfterFailure(uploadedImage.s3Key);
    }

    throw error;
  } finally {
    client?.release();
  }
}

export async function getTicketMessages(
  ticketId: string,
  userId: UserId,
  role: UserRole,
  query: GetMessagesQuery,
): Promise<TicketMessagePage> {
  const ticket = await findTicketById(ticketId);

  ensureTicketExists(ticket);
  ensureParticipantCanAccessTicketMessages(ticket, userId, role);

  const messagesWithExtraItem = await getTicketMessagesRepository({
    ticketId,
    limit: query.limit + 1,
    beforeId: query.beforeId ?? null,
  });

  const hasMoreMessages = messagesWithExtraItem.length > query.limit;
  const messages = hasMoreMessages
    ? messagesWithExtraItem.slice(0, query.limit)
    : messagesWithExtraItem;
  const oldestMessage = messages.at(-1);
  const chronologicalMessages = [...messages].reverse();
  const messagesWithAttachments = await addImageUrlsToMessages(
    chronologicalMessages,
  );

  return {
    messages: messagesWithAttachments,
    pagination: {
      limit: query.limit,
      nextBeforeId: hasMoreMessages ? (oldestMessage?.id ?? null) : null,
    },
  };
}

async function addImageUrlsToMessages(
  messages: TicketMessage[],
): Promise<TicketMessage[]> {
  const attachments = await getTicketMessageAttachments(
    messages.map((message) => message.id),
  );
  const attachmentsByMessageId = groupAttachmentsByMessageId(attachments);

  return Promise.all(
    messages.map(async (message) => {
      const storedAttachments = attachmentsByMessageId.get(message.id) ?? [];
      const messageAttachments = await Promise.all(
        storedAttachments.map(async (attachment) => ({
          id: attachment.id,
          mimeType: attachment.mimeType,
          imageUrl: await createTicketMessageImageUrl(attachment.s3Key),
        })),
      );

      return {
        ...message,
        attachments: messageAttachments,
      };
    }),
  );
}

function groupAttachmentsByMessageId(
  attachments: TicketMessageStoredAttachment[],
): Map<string, TicketMessageStoredAttachment[]> {
  const attachmentsByMessageId = new Map<
    string,
    TicketMessageStoredAttachment[]
  >();

  for (const attachment of attachments) {
    const attachmentsForMessage =
      attachmentsByMessageId.get(attachment.messageId) ?? [];

    attachmentsForMessage.push(attachment);
    attachmentsByMessageId.set(attachment.messageId, attachmentsForMessage);
  }

  return attachmentsByMessageId;
}

function ensureMessageIsNotEmpty(
  messageInput: CreateMessageInput,
  image: TicketMessageImage | undefined,
): void {
  if (messageInput.body || image) {
    return;
  }

  throw new AppError(
    400,
    'A ticket message must include text, an image, or both',
    'EMPTY_MESSAGE',
  );
}

function ensureImageIsValid(image: TicketMessageImage | undefined): void {
  if (!image) {
    return;
  }

  if (!isTicketMessageImageMimeType(image.mimeType)) {
    throw new AppError(
      400,
      'Only JPEG, PNG, and WebP images can be attached to a ticket message',
      'INVALID_IMAGE_TYPE',
    );
  }

  if (
    image.fileSizeBytes < 1 ||
    image.fileSizeBytes > MAX_TICKET_MESSAGE_IMAGE_SIZE_BYTES
  ) {
    throw new AppError(
      400,
      'Attached images must be larger than 0 bytes and 5 MB or smaller',
      'INVALID_IMAGE_SIZE',
    );
  }
}

function ensureTicketExists(
  ticket: {
    customer_id: string;
    assigned_agent_id: string | null;
    status: string;
  } | null,
): asserts ticket is {
  customer_id: string;
  assigned_agent_id: string | null;
  status: string;
} {
  if (ticket) {
    return;
  }

  throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
}

function ensureTicketCanReceiveMessages(ticket: { status: string }): void {
  if (ticket.status !== 'closed') {
    return;
  }

  throw new AppError(
    409,
    'This ticket is closed and can no longer receive messages',
    'TICKET_CLOSED',
  );
}

function ensureParticipantCanAccessTicketMessages(
  ticket: {
    customer_id: string;
    assigned_agent_id: string | null;
  },
  senderId: UserId,
  role: UserRole,
): void {
  const isTicketCustomer =
    role === 'customer' && ticket.customer_id === senderId;
  const isAssignedAgent =
    role === 'agent' && ticket.assigned_agent_id === senderId;

  if (isTicketCustomer || isAssignedAgent) {
    return;
  }

  throw new AppError(
    403,
    'You are not allowed to access messages on this ticket',
    'FORBIDDEN',
  );
}

async function rollBackTicketMessageTransaction(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error(
      'Failed to roll back ticket message creation:',
      rollbackError,
    );
  }
}

async function deleteUploadedImageAfterFailure(s3Key: string): Promise<void> {
  try {
    await deleteTicketMessageImage(s3Key);
  } catch (deleteError) {
    console.error(
      'Failed to clean up ticket message image after message creation failed:',
      deleteError,
    );
  }
}
