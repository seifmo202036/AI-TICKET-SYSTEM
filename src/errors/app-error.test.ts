import { describe, expect, it } from 'vitest';

import { AppError } from './app-error.js';

describe('AppError', () => {
  it('exposes status code, code, and name', () => {
    const error = new AppError(409, 'Conflict happened.', 'CONFLICT');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Conflict happened.');
    expect(error instanceof Error).toBe(true);
  });

  it('preserves the original cause when provided', () => {
    const rootCause = new Error('root failure');
    const error = new AppError(500, 'Wrapped.', 'DATABASE_QUERY_FAILED', {
      cause: rootCause,
    });

    expect(error.cause).toBe(rootCause);
  });

  it('has no cause when not provided', () => {
    const error = new AppError(404, 'Missing.', 'ROUTE_NOT_FOUND');

    expect(error.cause).toBeUndefined();
  });
});
