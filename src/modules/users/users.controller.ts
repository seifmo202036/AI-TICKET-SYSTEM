import type { Request, RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import { userIdParamsSchema } from './users.validation.js';
import {
  approveAgent,
  getPendingAgents,
  reinstateUser,
  suspendUser,
} from './users.service.js';

function parseUserIdParam(request: Request): string {
  const result = userIdParamsSchema.safeParse(request.params);

  if (!result.success) {
    throw new AppError(400, 'The user id is invalid.', 'INVALID_USER_ID');
  }

  return result.data.userId;
}

export const suspendUserController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const userId = parseUserIdParam(request);
    const user = await suspendUser(userId);

    response.status(200).json({
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const reinstateUserController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const userId = parseUserIdParam(request);
    const user = await reinstateUser(userId);

    response.status(200).json({
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingAgentsController: RequestHandler = async (
  _request,
  response,
  next,
): Promise<void> => {
  try {
    const agents = await getPendingAgents();

    response.status(200).json({
      data: {
        agents,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const approveAgentController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const userId = parseUserIdParam(request);
    const user = await approveAgent(userId);

    response.status(200).json({
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};
