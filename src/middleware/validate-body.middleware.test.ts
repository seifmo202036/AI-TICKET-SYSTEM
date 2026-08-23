import type { NextFunction, Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';
import { validateBodyMiddleware } from './validate-body.middleware.js';

const schema = z.object({
  userName: z.string().trim().min(3),
});

function createRequestHandlerArgs(body: unknown) {
  const request = { body } as Request;
  const response = vi.fn() as never;
  const next = vi.fn() as NextFunction;

  return { request, response, next };
}

describe('validateBodyMiddleware', () => {
  it('replaces req.body with the parsed value and continues', () => {
    const middleware = validateBodyMiddleware(schema);
    const { request, next } = createRequestHandlerArgs({
      userName: '  seif  ',
      extra: 'dropped',
    });

    middleware(request, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(request.body).toEqual({ userName: 'seif' });
  });

  it('passes a 400 AppError with a field-prefixed message on failure', () => {
    const middleware = validateBodyMiddleware(schema);
    const { request, next } = createRequestHandlerArgs({
      userName: 'ab',
    });

    middleware(request, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = vi.mocked(next).mock.calls[0]?.[0];

    expect(error).toBeInstanceOf(AppError);
    const appError = error as unknown as AppError;
    expect(appError.statusCode).toBe(400);
    expect(appError.code).toBe('VALIDATION_ERROR');
    expect(appError.message).toContain('userName');
  });

  it('does not call next with an error when validation succeeds', () => {
    const middleware = validateBodyMiddleware(schema);
    const { request, next } = createRequestHandlerArgs({
      userName: 'seif',
    });

    middleware(request, {} as never, next);

    expect(vi.mocked(next).mock.calls[0]).toHaveLength(0);
  });
});
