import type { UserId, UserRole } from '../users/user.types.js';

export interface TicketMessageSender {
  id: UserId;
  userName: string;
  role: UserRole;
}

export interface TicketMessageAttachment {
  id: string;
  mimeType: string;
  imageUrl: string;
}

export type TicketMessageImageMimeType =
  'image/jpeg' | 'image/png' | 'image/webp';

export interface TicketMessageImage {
  buffer: Buffer;
  mimeType: TicketMessageImageMimeType;
  fileSizeBytes: number;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  sender: TicketMessageSender;
  body: string | null;
  attachments: TicketMessageAttachment[];
  createdAt: Date;
}

export interface TicketMessagePage {
  messages: TicketMessage[];
  pagination: {
    limit: number;
    nextBeforeId: string | null;
  };
}

export interface CreateTicketMessageRepositoryInput {
  ticketId: string;
  senderId: UserId;
  body: string | null;
}

export interface CreateTicketMessageAttachmentRepositoryInput {
  messageId: string;
  s3Key: string;
  mimeType: TicketMessageImageMimeType;
  fileSizeBytes: number;
}

export interface GetTicketMessagesRepositoryInput {
  ticketId: string;
  limit: number;
  beforeId: string | null;
}

export interface DbTicketMessageRow {
  id: string;
  ticket_id: string;
  sender_id: UserId;
  sender_user_name: string;
  sender_role: UserRole;
  body: string | null;
  created_at: Date;
}

export interface DbTicketMessageAttachmentRow {
  id: string;
  message_id: string;
  s3_key: string;
  mime_type: TicketMessageImageMimeType;
  file_size_bytes: string;
  created_at: Date;
}

export interface TicketMessageStoredAttachment {
  id: string;
  messageId: string;
  s3Key: string;
  mimeType: TicketMessageImageMimeType;
  fileSizeBytes: number;
  createdAt: Date;
}
