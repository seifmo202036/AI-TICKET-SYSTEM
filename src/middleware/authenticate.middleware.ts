import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { AppError } from '../errors/app-error.js';
import { ACCESS_TOKEN_COOKIE } from '../modules/auth/auth.cookie.js';
import { verifyAccessToken } from '../modules/auth/auth.token.js';
import { findUserById } from '../modules/users/user.repository.js';
import type { UserId } from '../modules/users/user.types.js';

export const authenticateMiddleware: RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {
  const accessToken: unknown = request.cookies?.[ACCESS_TOKEN_COOKIE];

  if (typeof accessToken !== 'string' || !accessToken) {
    next(
      new AppError(
        401,
        'Authentication is required. Please sign in.',
        'AUTHENTICATION_REQUIRED',
      ),
    );
    return;
  }

  let userId: UserId;

  try {
    ({ userId } = verifyAccessToken(accessToken));
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(
        new AppError(
          401,
          'Your access token has expired. Please refresh your session.',
          'ACCESS_TOKEN_EXPIRED',
        ),
      );
      return;
    }

    next(
      new AppError(
        401,
        'The access token is invalid. Please sign in again.',
        'INVALID_ACCESS_TOKEN',
      ),
    );
    return;
  }

  try {
    const currentUser = await findUserById(userId);

    if (!currentUser) {
      next(
        new AppError(
          401,
          'The authenticated user no longer exists. Please sign in again.',
          'INVALID_AUTHENTICATION',
        ),
      );
      return;
    }

    if (currentUser.accountStatus === 'suspended') {
      next(
        new AppError(
          403,
          'Your account has been suspended.',
          'ACCOUNT_SUSPENDED',
        ),
      );
      return;
    }

    if (currentUser.accountStatus !== 'active') {
      next(
        new AppError(403, 'Your account is not active.', 'ACCOUNT_NOT_ACTIVE'),
      );
      return;
    }

    request.auth = {
      userId: currentUser.id,
      role: currentUser.role,
    };
    response.locals.currentUser = currentUser;

    next();
  } catch (error) {
    next(error);
  }
};
