import type {
    Request,
    Response,
    NextFunction,
} from "express";
import { AppError } from '../../errors/app-error.js';
import {
    createTicketSchema,
    ticketIdParamsSchema,
} from "./tickets.validation.js";
import { createTicket, getCustomerTickets, getTicketById, getTicketQueue, claimTicket, getAssignedTickets, resolveTicket, closeTicket} from "./tickets.service.js";

export async function createTicketController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // 1. Validate request body
        const result = createTicketSchema.safeParse(req.body);

        if (!result.success) {
            const validationMessage = result.error.issues
                .map((issue) => {
                    const field = issue.path.join(".");

                    return field ? `${field}: ${issue.message}` : issue.message;
                })
                .join(", ");

            throw new AppError(400, validationMessage, "VALIDATION_ERROR");
        }

        const ticketInput = result.data;

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
// GET /tickets
export async function getCustomerTicketsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const customerId = req.auth?.userId;

        if (!customerId) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        const tickets = await getCustomerTickets(
            customerId,
        );

        res.status(200).json({
            tickets,
        });

    } catch (error) {
        next(error);
    }
}


// GET /tickets/:ticketId
export async function getTicketByIdController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const userId = req.auth?.userId;
        const role = req.auth?.role;

        if (!userId || !role) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        const paramsResult = ticketIdParamsSchema.safeParse(req.params);

        if (!paramsResult.success) {
            throw new AppError(
                400,
                "Invalid ticket id",
                "INVALID_TICKET_ID",
            );
        }

        const ticketId = paramsResult.data.ticketId;

        const ticket = await getTicketById(
            ticketId,
            userId,
            role,
        );

        res.status(200).json({
            ticket,
        });

    } catch (error) {
        next(error);
    }
}


// GET /tickets/queue
export async function getTicketQueueController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const tickets = await getTicketQueue();

        res.status(200).json({
            tickets,
        });

    } catch (error) {
        next(error);
    }
}


// POST /tickets/:ticketId/claim
export async function claimTicketController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // 1. Get authenticated agent from JWT middleware
        const agentId = req.auth?.userId;

        if (!agentId) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        // 2. Validate request params
        const paramsResult = ticketIdParamsSchema.safeParse(req.params);

        if (!paramsResult.success) {
            throw new AppError(
                400,
                "Invalid ticket id",
                "INVALID_TICKET_ID",
            );
        }

        const ticketId = paramsResult.data.ticketId;

        // 3. Call business logic
        const ticket = await claimTicket(ticketId, agentId);

        // 4. Send HTTP response
        res.status(200).json({
            message: "Ticket claimed successfully",
            ticket,
        });
    } catch (error) {
        next(error);
    }
}


// GET /tickets/assigned
export async function getAssignedTicketsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const agentId = req.auth?.userId;

        if (!agentId) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        const tickets = await getAssignedTickets(agentId);

        res.status(200).json({
            tickets,
        });

    } catch (error) {
        next(error);
    }
}


// POST /tickets/:ticketId/resolve
export async function resolveTicketController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // 1. Get authenticated agent from JWT middleware
        const agentId = req.auth?.userId;

        if (!agentId) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        // 2. Validate request params
        const paramsResult = ticketIdParamsSchema.safeParse(req.params);

        if (!paramsResult.success) {
            throw new AppError(
                400,
                "Invalid ticket id",
                "INVALID_TICKET_ID",
            );
        }

        const ticketId = paramsResult.data.ticketId;

        // 3. Call business logic
        const ticket = await resolveTicket(ticketId, agentId);

        // 4. Send HTTP response
        res.status(200).json({
            message: "Ticket resolved successfully",
            ticket,
        });
    } catch (error) {
        next(error);
    }
}


// POST /tickets/:ticketId/close
export async function closeTicketController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        // 1. Get authenticated customer from JWT middleware
        const customerId = req.auth?.userId;

        if (!customerId) {
            throw new AppError(
                401,
                "Unauthenticated",
                "UNAUTHENTICATED",
            );
        }

        // 2. Validate request params
        const paramsResult = ticketIdParamsSchema.safeParse(req.params);

        if (!paramsResult.success) {
            throw new AppError(
                400,
                "Invalid ticket id",
                "INVALID_TICKET_ID",
            );
        }

        const ticketId = paramsResult.data.ticketId;

        // 3. Call business logic
        const ticket = await closeTicket(ticketId, customerId);

        // 4. Send HTTP response
        res.status(200).json({
            message: "Ticket closed successfully",
            ticket,
        });
    } catch (error) {
        next(error);
    }
}