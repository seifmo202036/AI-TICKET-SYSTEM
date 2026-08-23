import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Behind a reverse proxy in production, configure `trust proxy` so client IPs
// are used for limiting instead of the proxy address.
function createRateLimitMiddleware(limit: number): RequestHandler {
  if (env.NODE_ENV === 'test') {
    // Deterministic smoke tests would otherwise trip the same-IP limits.
    return (_request, _response, next): void => {
      next();
    };
  }

  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit,
    legacyHeaders: false,
    handler: (_request, _response, next): void => {
      next(
        new AppError(
          429,
          'Too many requests. Please slow down and try again later.',
          'RATE_LIMITED',
        ),
      );
    },
  });
}

export const authGeneralRateLimiter = createRateLimitMiddleware(300);
export const signupRateLimiter = createRateLimitMiddleware(20);
export const loginRateLimiter = createRateLimitMiddleware(10);
export const refreshRateLimiter = createRateLimitMiddleware(30);
