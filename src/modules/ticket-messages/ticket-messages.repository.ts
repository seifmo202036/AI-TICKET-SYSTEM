import type { PoolClient } from 'pg';

import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';
import type {
  CreateTicketMessageAttachmentRepositoryInput,
  CreateTicketMessageRepositoryInput,
  DbTicketMessageAttachmentRow,
  DbTicketMessageRow,
  GetTicketMessagesRepositoryInput,
  TicketMessage,
  TicketMessageStoredAttachment,
} from './ticket-messages.types.js';

export async function createTicketMessage(
  messageInput: CreateTicketMessageRepositoryInput,
  client: PoolClient,
): Promise<TicketMessage | null> {
  try {
    const result = await client.query<DbTicketMessageRow>(
      `
      WITH created_message AS (
        INSERT INTO ticket_messages (
          ticket_id,
          sender_id,
          body
        )
        VALUES ($1, $2, $3)
        RETURNING
          id,
          ticket_id,
          sender_id,
          body,
          created_at
      )
      SELECT
        created_message.id,
        created_message.ticket_id,
        created_message.sender_id,
        users.user_name AS sender_user_name,
        users.role AS sender_role,
        created_message.body,
        created_message.created_at
      FROM created_message
      INNER JOIN users
        ON users.id = created_message.sender_id
      `,
      [messageInput.ticketId, messageInput.senderId, messageInput.body],
    );

    const message = result.rows[0];

    if (!message) {
      return null;
    }

    return mapTicketMessage(message);
  } catch (error) {
    throw new AppError(
      500,
      'Unable to create ticket message',
      'DB_CREATE_TICKET_MESSAGE_FAILED',
      { cause: error },
    );
  }
}

export async function getTicketMessages(
  query: GetTicketMessagesRepositoryInput,
): Promise<TicketMessage[]> {
  try {
    const result = await pool.query<DbTicketMessageRow>(
      `
      SELECT
        ticket_messages.id,
        ticket_messages.ticket_id,
        ticket_messages.sender_id,
        users.user_name AS sender_user_name,
        users.role AS sender_role,
        ticket_messages.body,
        ticket_messages.created_at
      FROM ticket_messages
      INNER JOIN users
        ON users.id = ticket_messages.sender_id
      WHERE ticket_messages.ticket_id = $1
        AND (
          $3::BIGINT IS NULL
          OR (ticket_messages.created_at, ticket_messages.id) < (
            SELECT
              cursor_message.created_at,
              cursor_message.id
            FROM ticket_messages AS cursor_message
            WHERE cursor_message.ticket_id = $1
              AND cursor_message.id = $3
          )
        )
      ORDER BY ticket_messages.created_at DESC, ticket_messages.id DESC
      LIMIT $2
      `,
      [query.ticketId, query.limit, query.beforeId],
    );

    return result.rows.map(mapTicketMessage);
  } catch (error) {
    throw new AppError(
      500,
      'Unable to get ticket messages',
      'DB_GET_TICKET_MESSAGES_FAILED',
      { cause: error },
    );
  }
}

export async function createTicketMessageAttachment(
  attachmentInput: CreateTicketMessageAttachmentRepositoryInput,
  client: PoolClient,
): Promise<TicketMessageStoredAttachment | null> {
  try {
    const result = await client.query<DbTicketMessageAttachmentRow>(
      `
      INSERT INTO ticket_attachments (
        message_id,
        s3_key,
        mime_type,
        file_size_bytes
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        message_id,
        s3_key,
        mime_type,
        file_size_bytes,
        created_at
      `,
      [
        attachmentInput.messageId,
        attachmentInput.s3Key,
        attachmentInput.mimeType,
        attachmentInput.fileSizeBytes,
      ],
    );

    const attachment = result.rows[0];

    if (!attachment) {
      return null;
    }

    return mapTicketMessageStoredAttachment(attachment);
  } catch (error) {
    throw new AppError(
      500,
      'Unable to create ticket message attachment',
      'DB_CREATE_TICKET_MESSAGE_ATTACHMENT_FAILED',
      { cause: error },
    );
  }
}

export async function getTicketMessageAttachments(
  messageIds: string[],
): Promise<TicketMessageStoredAttachment[]> {
  if (messageIds.length === 0) {
    return [];
  }

  try {
    const result = await pool.query<DbTicketMessageAttachmentRow>(
      `
      SELECT
        id,
        message_id,
        s3_key,
        mime_type,
        file_size_bytes,
        created_at
      FROM ticket_attachments
      WHERE message_id = ANY($1::BIGINT[])
      ORDER BY created_at ASC, id ASC
      `,
      [messageIds],
    );

    return result.rows.map(mapTicketMessageStoredAttachment);
  } catch (error) {
    throw new AppError(
      500,
      'Unable to get ticket message attachments',
      'DB_GET_TICKET_MESSAGE_ATTACHMENTS_FAILED',
      { cause: error },
    );
  }
}

export function mapTicketMessage(message: DbTicketMessageRow): TicketMessage {
  return {
    id: message.id,
    ticketId: message.ticket_id,
    sender: {
      id: message.sender_id,
      userName: message.sender_user_name,
      role: message.sender_role,
    },
    body: message.body,
    attachments: [],
    createdAt: message.created_at,
  };
}

export function mapTicketMessageStoredAttachment(
  attachment: DbTicketMessageAttachmentRow,
): TicketMessageStoredAttachment {
  return {
    id: attachment.id,
    messageId: attachment.message_id,
    s3Key: attachment.s3_key,
    mimeType: attachment.mime_type,
    fileSizeBytes: Number(attachment.file_size_bytes),
    createdAt: attachment.created_at,
  };
}
