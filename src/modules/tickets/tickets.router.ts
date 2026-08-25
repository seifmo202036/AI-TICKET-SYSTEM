import { Router } from 'express';

export const ticketRouter = Router();
import { authenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorizeMiddleware } from '../../middleware/authorize.middleware.js';
import {
    createTicketController,
    getCustomerTicketsController,
    getTicketByIdController,
    getTicketQueueController,
    claimTicketController,
    getAssignedTicketsController,
    resolveTicketController,
    closeTicketController,
} from "./tickets.controller.js";


// CREATE TICKET
ticketRouter.post(
    "/create",
    authenticateMiddleware,
    authorizeMiddleware("customer"),
    createTicketController,
);


// GET CUSTOMER'S TICKETS
ticketRouter.get(
    "/",
    authenticateMiddleware,
    authorizeMiddleware("customer"),
    getCustomerTicketsController,
);


// GET AGENT QUEUE
// Must be BEFORE /:ticketId
ticketRouter.get(
    "/queue",
    authenticateMiddleware,
    authorizeMiddleware("agent"),
    getTicketQueueController,
);


// GET AGENT'S ASSIGNED TICKETS
// Must be BEFORE /:ticketId
ticketRouter.get(
    "/assigned",
    authenticateMiddleware,
    authorizeMiddleware("agent"),
    getAssignedTicketsController,
);


// CLAIM TICKET (AGENT)
ticketRouter.post(
    "/:ticketId/claim",
    authenticateMiddleware,
    authorizeMiddleware("agent"),
    claimTicketController,
);


// RESOLVE TICKET (ASSIGNED AGENT)
ticketRouter.post(
    "/:ticketId/resolve",
    authenticateMiddleware,
    authorizeMiddleware("agent"),
    resolveTicketController,
);


// CLOSE TICKET (CUSTOMER CONFIRMS RESOLUTION)
ticketRouter.post(
    "/:ticketId/close",
    authenticateMiddleware,
    authorizeMiddleware("customer"),
    closeTicketController,
);


// GET ONE TICKET
ticketRouter.get(
    "/:ticketId",
    authenticateMiddleware,
    getTicketByIdController,
);