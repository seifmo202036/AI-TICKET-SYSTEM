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

export type CreateTicketInput =
    z.infer<typeof createTicketSchema>;