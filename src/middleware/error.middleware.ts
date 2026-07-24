import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/app-error.ts';
import { env } from '../config/env.ts';

export const errorHandler: ErrorRequestHandler = (err,_req,res,next)=> {
  // Let Express handle it if the response already started.
  if (res.headersSent) {
    next(err);
    return;
  }

  const isAppError = err instanceof AppError;

  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError
    ? err.code
    : 'INTERNAL_SERVER_ERROR';

  if (env.NODE_ENV === 'development') {
    console.error(err);

    res.status(statusCode).json({
      message: err instanceof Error ? err.message : 'Unknown error',
      code,
      stack: err instanceof Error ? err.stack : undefined,
      cause: err instanceof Error ? err.cause : undefined,
    });

    return;
  }

  res.status(statusCode).json({
    message: isAppError
      ? err.message
      : 'Internal server error',
    code,
  });
};