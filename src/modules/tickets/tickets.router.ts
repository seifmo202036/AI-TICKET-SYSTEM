import { Router } from 'express';

export const ticketRouter = Router();
import { authenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorizeMiddleware } from '../../middleware/authorize.middleware.js';
import {createTicketController} from '../tickets/tickets.controller.js'

ticketRouter.post('/tickets/create',authenticateMiddleware,
    authorizeMiddleware('customer'),createTicketController,);