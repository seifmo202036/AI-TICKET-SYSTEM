import type { NextFunction, Request, Response } from 'express';

import { loginSchema, signupSchema } from './auth.validation.js';
import {
  login,
  logout,
  refreshAuthentication,
  signup,
} from './auth.service.js';
import { AppError } from '../../errors/app-error.js';
import type { PublicUser } from '../users/user.types.js';

import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
} from './auth.cookie.js';

export async function signupController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = signupSchema.parse(request.body);

    const user = await signup(input);

    response.status(201).json({
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(200).json({
      message: 'Login successful.',
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export function getCurrentUserController(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  const currentUser = response.locals.currentUser as PublicUser | undefined;

  if (!currentUser) {
    next(
      new AppError(
        401,
        'Authentication information is missing. Please sign in again.',
        'AUTHENTICATION_REQUIRED',
      ),
    );
    return;
  }

  response.status(200).json({
    user: currentUser,
  });
}

export async function refreshController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const refreshToken: unknown = request.cookies?.[REFRESH_TOKEN_COOKIE];

  if (typeof refreshToken !== 'string' || !refreshToken) {
    next(
      new AppError(
        401,
        'A refresh token is required. Please sign in again.',
        'REFRESH_TOKEN_REQUIRED',
      ),
    );
    return;
  }

  try {
    const result = await refreshAuthentication(refreshToken);

    setAuthCookies(response, result.accessToken, result.refreshToken);

    response.status(200).json({
      message: 'Authentication refreshed successfully.',
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const refreshToken: unknown = request.cookies?.[REFRESH_TOKEN_COOKIE];

  try {
    if (typeof refreshToken === 'string' && refreshToken) {
      await logout(refreshToken);
    }

    clearAuthCookies(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}
