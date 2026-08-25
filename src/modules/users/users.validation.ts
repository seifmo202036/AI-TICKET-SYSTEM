import { z } from 'zod';

export const userIdParamsSchema = z.object({
  userId: z
    .string()
    .regex(/^[1-9]\d*$/, 'The user id is invalid.'),
}).strict();

export type UserIdParams = z.infer<typeof userIdParamsSchema>;
