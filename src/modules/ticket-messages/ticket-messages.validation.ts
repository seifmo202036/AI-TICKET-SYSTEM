import { z } from 'zod';

export const createMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const getMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(50),
    beforeId: z
      .string()
      .regex(/^[1-9]\d*$/, 'Invalid message cursor')
      .optional(),
  })
  .strict();

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
