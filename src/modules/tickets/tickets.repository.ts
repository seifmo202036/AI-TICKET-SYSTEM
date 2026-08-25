import type { CreateTicketInput } from '../tickets/tickets.validation.js'
import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';
import type { PoolClient } from 'pg'; // used for transaction to reserve one DB connection until the end of that transaction

export async function createTicket(
    ticketInput: CreateTicketInput,
    customerId: string,
) {

    try {
        const result = await pool.query(
            `
    INSERT INTO tickets (
        customer_id,
        customer_issue_type,
        description
    )
    VALUES ($1, $2, $3)
      RETURNING *
    `,
            // RETURNING * After inserting the row, return all columns of the newly created row
            [
                customerId,
                ticketInput.customerIssueType,
                ticketInput.description
            ],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to create ticket",
            "DB_CREATE_TICKET_FAILED",
            { cause: error },
        );
    }
};

// GET customer's own tickets
export async function getCustomerTickets(
    customerId: string,
) {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM tickets
            WHERE customer_id = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            `,
            [customerId],
        );

        return result.rows;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to get customer tickets",
            "DB_GET_CUSTOMER_TICKETS_FAILED",
            { cause: error },
        );
    }
}


// GET one ticket
export async function findTicketById(
    ticketId: string,
) {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM tickets
            WHERE id = $1
              AND deleted_at IS NULL
            `,
            [ticketId],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to get ticket",
            "DB_GET_TICKET_FAILED",
            { cause: error },
        );
    }
}


// GET available tickets for agents
export async function getTicketQueue() {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM tickets
            WHERE status = 'open'
              AND assigned_agent_id IS NULL
              AND deleted_at IS NULL
            ORDER BY created_at ASC
            `,
        );

        return result.rows;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to get ticket queue",
            "DB_GET_TICKET_QUEUE_FAILED",
            { cause: error },
        );
    }
}


// GET one ticket with a row lock, must run inside a transaction
export async function findTicketByIdForUpdate(
    ticketId: string,
    client: PoolClient,
) {
    try {
        const result = await client.query(
            `
            SELECT *
            FROM tickets
            WHERE id = $1
              AND deleted_at IS NULL
            FOR UPDATE
            `,
            [ticketId],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to get ticket",
            "DB_GET_TICKET_FAILED",
            { cause: error },
        );
    }
}

// CLAIM ticket for an agent
export async function claimTicket(
    ticketId: string,
    agentId: string,
    client: PoolClient,
) {
    try {
        const result = await client.query(
            `
            UPDATE tickets
            SET
                status = 'assigned',
                assigned_agent_id = $2,
                assigned_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [ticketId, agentId],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to claim ticket",
            "DB_CLAIM_TICKET_FAILED",
            { cause: error },
        );
    }
};

// RESOLVE ticket
export async function resolveTicket(
    ticketId: string,
    client: PoolClient,
) {
    try {
        const result = await client.query(
            `
            UPDATE tickets
            SET
                status = 'resolved',
                resolved_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [ticketId],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to resolve ticket",
            "DB_RESOLVE_TICKET_FAILED",
            { cause: error },
        );
    }
};

// CLOSE ticket
export async function closeTicket(
    ticketId: string,
    client: PoolClient,
) {
    try {
        const result = await client.query(
            `
            UPDATE tickets
            SET
                status = 'closed',
                closed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [ticketId],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to close ticket",
            "DB_CLOSE_TICKET_FAILED",
            { cause: error },
        );
    }
};

// INSERT row into ticket_status_history
export async function insertTicketStatusHistory(
    ticketId: string,
    changedBy: string | null,
    oldStatus: string | null,
    newStatus: string,
    client?: PoolClient,
) {
    try {
        const database = client ?? pool;

        const result = await database.query(
            `
            INSERT INTO ticket_status_history (
                ticket_id,
                changed_by,
                old_status,
                new_status
            )
            VALUES ($1, $2, $3, $4)
              RETURNING *
            `,
            [ticketId, changedBy, oldStatus, newStatus],
        );

        return result.rows[0] ?? null;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to insert ticket status history",
            "DB_INSERT_TICKET_STATUS_HISTORY_FAILED",
            { cause: error },
        );
    }
};

// GET tickets assigned to an agent
export async function getAssignedTickets(
    agentId: string,
) {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM tickets
            WHERE assigned_agent_id = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            `,
            [agentId],
        );

        return result.rows;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to get assigned tickets",
            "DB_GET_ASSIGNED_TICKETS_FAILED",
            { cause: error },
        );
    }
}

// AUTO CLOSE tickets that stayed resolved for more than 48 hours
export async function autoCloseExpiredResolvedTickets(
    client: PoolClient,
) {
    try {
        const result = await client.query(
            `
            UPDATE tickets
            SET
                status = 'closed',
                closed_at = NOW(),
                updated_at = NOW()
            WHERE status = 'resolved'
              AND deleted_at IS NULL
              AND resolved_at <= NOW() - INTERVAL '48 hours'
            RETURNING id
            `,
        );

        return result.rows;
    } catch (error) {
        throw new AppError(
            500,
            "Unable to auto close tickets",
            "DB_AUTO_CLOSE_TICKETS_FAILED",
            { cause: error },
        );
    }
}
