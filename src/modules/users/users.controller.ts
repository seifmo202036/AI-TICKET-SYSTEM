import type { Request, RequestHandler } from 'express';

import { AppError } from '../../errors/app-error.js';
import type { UserId } from './user.types.js';
import { reinstateUser, suspendUser } from './users.service.js';

const USER_ID_PATTERN = /^[1-9]\d*$/;

function parseUserIdParam(request: Request): UserId {
  const rawUserId: unknown = request.params.userId;

  if (typeof rawUserId === 'string' && USER_ID_PATTERN.test(rawUserId)) {
    return rawUserId;
  }

  throw new AppError(400, 'The user id is invalid.', 'INVALID_USER_ID');
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
