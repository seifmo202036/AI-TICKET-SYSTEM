import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import type { UserRole } from '../modules/users/user.types.js';

export function authorizeMiddleware(
  ...allowedRoles: UserRole[]
): RequestHandler {
  return (request, _response, next): void => {
    if (!request.auth) {
      next(
        new AppError(
          401,
          'Authentication information is missing. Please sign in again.',
          'AUTHENTICATION_REQUIRED',
        ),
      );
      return;
    }

    if (!allowedRoles.includes(request.auth.role)) {
      next(
        new AppError(
          403,
          'You do not have permission to access this resource.',
          'FORBIDDEN',
        ),
      );
      return;
    }

    next();
  };
}
