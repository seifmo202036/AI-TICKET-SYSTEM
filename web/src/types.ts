export type Role = 'customer' | 'agent' | 'admin';

export interface User {
  id: string;
  userName: string;
  email: string;
  role: Role;
  accountStatus: 'pending' | 'active' | 'suspended';
  createdAt: string;
}

export type TicketStatus =
  'triaging' | 'open' | 'assigned' | 'resolved' | 'closed';

export type AiTriageStatus =
  'queued' | 'processing' | 'completed' | 'failed' | 'disabled';

export type AiTriageCategory =
  | 'payment'
  | 'refund'
  | 'account'
  | 'subscription'
  | 'technical'
  | 'billing'
  | 'security'
  | 'general'
  | 'other';

export type TicketUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  customer_id: string;
  assigned_agent_id: string | null;
  customer_issue_type: string;
  description: string;
  status: TicketStatus;
  ai_status: AiTriageStatus;
  ai_category: AiTriageCategory | null;
  ai_score: number | null;
  urgency: TicketUrgency | null;
  created_at: string;
  assigned_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface TicketMessageSender {
  id: string;
  userName: string;
  role: Role;
}

export interface TicketMessageAttachment {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  imageUrl: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  sender: TicketMessageSender;
  body: string | null;
  attachments: TicketMessageAttachment[];
  createdAt: string;
}

export interface TicketMessagePage {
  messages: TicketMessage[];
  pagination: {
    limit: number;
    nextBeforeId: string | null;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
