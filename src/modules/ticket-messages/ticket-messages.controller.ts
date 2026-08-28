import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import { ticketIdParamsSchema } from '../tickets/tickets.validation.js';
import {
  createTicketMessage,
  getTicketMessages,
} from './ticket-messages.service.js';
import {
  createMessageSchema,
  getMessagesQuerySchema,
} from './ticket-messages.validation.js';
import { toTicketMessageImage } from './ticket-message-images.js';

export async function createTicketMessageController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const paramsResult = ticketIdParamsSchema.safeParse(req.params);

    if (!paramsResult.success) {
      throw new AppError(400, 'Invalid ticket id', 'INVALID_TICKET_ID');
    }

    const bodyResult = createMessageSchema.safeParse(req.body);

    if (!bodyResult.success) {
      const validationMessage = bodyResult.error.issues
        .map((issue) => {
          const field = issue.path.join('.');

          return field ? `${field}: ${issue.message}` : issue.message;
        })
        .join(', ');

      throw new AppError(400, validationMessage, 'VALIDATION_ERROR');
    }

    const userId = req.auth?.userId;
    const role = req.auth?.role;

    if (!userId || !role) {
      throw new AppError(401, 'Unauthenticated', 'UNAUTHENTICATED');
    }

    const image = toTicketMessageImage(req.file);

    if (req.file && !image) {
      throw new AppError(
        400,
        'Only JPEG, PNG, and WebP images can be attached to a ticket message',
        'INVALID_IMAGE_TYPE',
      );
    }

    const message = await createTicketMessage(
      paramsResult.data.ticketId,
      userId,
      role,
      bodyResult.data,
      image,
    );

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

export async function getTicketMessagesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const paramsResult = ticketIdParamsSchema.safeParse(req.params);

    if (!paramsResult.success) {
      throw new AppError(400, 'Invalid ticket id', 'INVALID_TICKET_ID');
    }

    const queryResult = getMessagesQuerySchema.safeParse(req.query);

    if (!queryResult.success) {
      const validationMessage = queryResult.error.issues
        .map((issue) => {
          const field = issue.path.join('.');

          return field ? `${field}: ${issue.message}` : issue.message;
        })
        .join(', ');

      throw new AppError(400, validationMessage, 'VALIDATION_ERROR');
    }

    const userId = req.auth?.userId;
    const role = req.auth?.role;

    if (!userId || !role) {
      throw new AppError(401, 'Unauthenticated', 'UNAUTHENTICATED');
    }

    const page = await getTicketMessages(
      paramsResult.data.ticketId,
      userId,
      role,
      queryResult.data,
    );

    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
}
