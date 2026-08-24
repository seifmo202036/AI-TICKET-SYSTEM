import type { CreateTicketInput } from '../tickets/tickets.validation.js'
import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';

export async function createTicket(
    ticketInput: CreateTicketInput,
    customerId: string,
) {

    try{
    const result = await pool.query(
        `
    INSERT INTO tickets (
        customer_id,
        customer_issue_type,
        description,
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

    return result.rows[0]??null;}
    catch(error){
        throw new AppError(500 , 'unable to create ticket','DB_CREATE_TICKET_FAILED',{cause:error})
    }
    
};
