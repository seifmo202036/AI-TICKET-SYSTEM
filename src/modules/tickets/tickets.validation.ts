import { z } from "zod";

export const createTicketSchema = z.object({
    customerIssueType: z.enum([
        "payment",
        "refund",
        "account",
        "subscription",
        "technical",
        "billing",
        "security",
        "general",
        "other",
    ]),

    description: z.string().trim().min(1),
}).strict();

export const ticketIdParamsSchema = z.object({
    ticketId: z.string().regex(/^\d+$/, "Invalid ticket id"),
}).strict();

export type CreateTicketInput =
    z.infer<typeof createTicketSchema>;

export type TicketIdParams =
    z.infer<typeof ticketIdParamsSchema>;