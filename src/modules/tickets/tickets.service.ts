import type { CreateTicketInput } from "./tickets.validation.js";
import { AppError } from "../../errors/app-error.js";
import { pool } from "../../db/pool.js";
import {
    createTicket as createTicketRepo,
    getCustomerTickets as getCustomerTicketsRepo,
    findTicketById,
    getTicketQueue as getTicketQueueRepo,
    findTicketByIdForUpdate,
    claimTicket as claimTicketRepo,
    resolveTicket as resolveTicketRepo,
    closeTicket as closeTicketRepo,
    insertTicketStatusHistory,
    getAssignedTickets as getAssignedTicketsRepo,
} from "./tickets.repository.js";


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


export async function getCustomerTickets(
    customerId: string,
) {
    return await getCustomerTicketsRepo(customerId);
}


export async function getTicketById(
    ticketId: string,
    userId: string,
    role: string,
) {
    const ticket = await findTicketById(ticketId);

    if (!ticket) {
        throw new AppError(
            404,
            "Ticket not found",
            "TICKET_NOT_FOUND",
        );
    }


    // Customer can only see his own ticket
    if (
        role === "customer" &&
        ticket.customer_id !== userId
    ) {
        throw new AppError(
            403,
            "You are not allowed to access this ticket",
            "FORBIDDEN",
        );
    }


    // Agent can see:
    // 1. open tickets
    // 2. tickets assigned to him
    if (
        role === "agent" &&
        ticket.status !== "open" &&
        ticket.assigned_agent_id !== userId
    ) {
        throw new AppError(
            403,
            "You are not allowed to access this ticket",
            "FORBIDDEN",
        );
    }


    if (
        role !== "customer" &&
        role !== "agent"
    ) {
        throw new AppError(
            403,
            "Forbidden",
            "FORBIDDEN",
        );
    }

    return ticket;
}


export async function getTicketQueue() {
    return await getTicketQueueRepo();
}


export async function claimTicket(
    ticketId: string,
    agentId: string,
) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Lock the ticket row so two agents cannot claim it at the same time
        const ticket = await findTicketByIdForUpdate(ticketId, client);

        if (!ticket) {
            throw new AppError(
                404,
                "Ticket not found",
                "TICKET_NOT_FOUND",
            );
        }

        // 2. Only open unassigned tickets can be claimed
        if (
            ticket.status !== "open" ||
            ticket.assigned_agent_id !== null
        ) {
            throw new AppError(
                409,
                "This ticket can no longer be claimed",
                "TICKET_NOT_CLAIMABLE",
            );
        }

        // 3. Assign the ticket to the agent
        const claimedTicket = await claimTicketRepo(
            ticketId,
            agentId,
            client,
        );

        // 4. Track the status change open -> assigned
        await insertTicketStatusHistory(
            ticketId,
            agentId,
            "open",
            "assigned",
            client,
        );

        await client.query("COMMIT");

        return claimedTicket;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Failed to roll back ticket claim:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}


export async function getAssignedTickets(
    agentId: string,
) {
    return await getAssignedTicketsRepo(agentId);
}


export async function resolveTicket(
    ticketId: string,
    agentId: string,
) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Lock the ticket row while checking and updating it
        const ticket = await findTicketByIdForUpdate(ticketId, client);

        if (!ticket) {
            throw new AppError(
                404,
                "Ticket not found",
                "TICKET_NOT_FOUND",
            );
        }

        // 2. Only the assigned agent can resolve the ticket
        if (ticket.assigned_agent_id !== agentId) {
            throw new AppError(
                403,
                "Only the assigned agent can resolve this ticket",
                "FORBIDDEN",
            );
        }

        // 3. Only assigned tickets can be resolved
        if (ticket.status !== "assigned") {
            throw new AppError(
                409,
                "This ticket cannot be resolved",
                "TICKET_NOT_RESOLVABLE",
            );
        }

        // 4. Mark the ticket as resolved
        const resolvedTicket = await resolveTicketRepo(ticketId, client);

        // 5. Track the status change assigned -> resolved
        await insertTicketStatusHistory(
            ticketId,
            agentId,
            "assigned",
            "resolved",
            client,
        );

        await client.query("COMMIT");

        return resolvedTicket;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Failed to roll back ticket resolve:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}


export async function closeTicket(
    ticketId: string,
    customerId: string,
) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Lock the ticket row while checking and updating it
        const ticket = await findTicketByIdForUpdate(ticketId, client);

        if (!ticket) {
            throw new AppError(
                404,
                "Ticket not found",
                "TICKET_NOT_FOUND",
            );
        }

        // 2. Customer can only close his own ticket
        if (ticket.customer_id !== customerId) {
            throw new AppError(
                403,
                "You are not allowed to access this ticket",
                "FORBIDDEN",
            );
        }

        // 3. Customer confirms the resolution by closing the ticket
        if (ticket.status !== "resolved") {
            throw new AppError(
                409,
                "This ticket cannot be closed yet",
                "TICKET_NOT_CLOSABLE",
            );
        }

        // 4. Close the ticket
        const closedTicket = await closeTicketRepo(ticketId, client);

        // 5. Track the status change resolved -> closed
        await insertTicketStatusHistory(
            ticketId,
            customerId,
            "resolved",
            "closed",
            client,
        );

        await client.query("COMMIT");

        return closedTicket;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Failed to roll back ticket close:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}