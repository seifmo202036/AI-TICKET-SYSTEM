import type { Request, RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import { userIdParamsSchema } from './users.validation.js';
import {
  approveAgent,
  declineAgent,
  getManageableUsers,
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

function getAuthenticatedUserId(request: Request): string {
  const userId = request.auth?.userId;

  if (!userId) {
    throw new AppError(
      401,
      'Authentication is required. Please sign in.',
      'AUTHENTICATION_REQUIRED',
    );
  }

  return userId;
}

export const suspendUserController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const userId = parseUserIdParam(request);
    const user = await suspendUser(userId, getAuthenticatedUserId(request));

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

export const getManageableUsersController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const users = await getManageableUsers(getAuthenticatedUserId(request));

    response.status(200).json({
      data: {
        users,
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

export const declineAgentController: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  try {
    const userId = parseUserIdParam(request);
    await declineAgent(userId);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
