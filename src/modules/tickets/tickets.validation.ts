import { z } from 'zod';
import { AI_TRIAGE_CATEGORIES } from '../ai/ai.types.js';

export const createTicketSchema = z
  .object({
    customerIssueType: z.enum(AI_TRIAGE_CATEGORIES),

    description: z.string().trim().min(1),
  })
  .strict();

export const ticketIdParamsSchema = z
  .object({
    ticketId: z.string().regex(/^\d+$/, 'Invalid ticket id'),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export type TicketIdParams = z.infer<typeof ticketIdParamsSchema>;
