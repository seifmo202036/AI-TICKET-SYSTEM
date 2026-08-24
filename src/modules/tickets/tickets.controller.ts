import type {
    Request,
    Response,
    NextFunction,
} from "express";
import { AppError } from '../../errors/app-error.js';
import { createTicketSchema } from "./tickets.validation.js";
import { createTicket } from "./tickets.service.js";

export async function createTicketController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // 1. Validate request body
        const ticketInput = createTicketSchema.parse(req.body);

        // 2. Get authenticated customer from JWT middleware
        const customerId = req.auth?.userId;
        if (!customerId) {
        throw new AppError(
            401,
            "Unauthenticated",
            "UNAUTHENTICATED",
        );
        }

        // 3. Call business logic
        const ticket = await createTicket(
            ticketInput,
            customerId,
        );

        // 4. Send HTTP response
        res.status(201).json({
            message: "Ticket created successfully",
            ticket,
        });
    } catch (error) {
        next(error);
    }
}