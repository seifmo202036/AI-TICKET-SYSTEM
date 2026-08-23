import type { CookieOptions, Response } from 'express';

import { env } from '../../config/env.js';

import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  REFRESH_TOKEN_COOKIE_MAX_AGE,
} from './auth.token.js';

export const ACCESS_TOKEN_COOKIE = 'accessToken';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

function commonCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}

export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...commonCookieOptions(),
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
    path: '/api',
  });

  response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...commonCookieOptions(),
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    path: '/api/v1/auth',
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, {
    ...commonCookieOptions(),
    path: '/api',
  });

  response.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...commonCookieOptions(),
    path: '/api/v1/auth',
  });
}
