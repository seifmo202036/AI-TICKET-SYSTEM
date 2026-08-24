import type { CreateTicketInput } from "./tickets.validation.js";
import { createTicket as createTicketRepo } from "./tickets.repository.js";
import { AppError } from "../../errors/app-error.js";

export async function createTicket(
    ticketInput: CreateTicketInput,
    customerId: string,
) {
    const ticket = await createTicketRepo(
        ticketInput,
        customerId,
    );

    if (!ticket) {
        throw new AppError(
            500,
            "Unable to create ticket",
            "TICKET_CREATION_FAILED",
        );
    }

    return ticket;
}