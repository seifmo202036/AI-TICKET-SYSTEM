import { describe, expect, it } from 'vitest';

import { userIdParamsSchema } from './users.validation.js';

describe('userIdParamsSchema', () => {
  it('accepts a numeric user id', () => {
    const result = userIdParamsSchema.parse({ userId: '42' });

    expect(result.userId).toBe('42');
  });

  it.each(['abc', '', '0', '-1', '1.5', '12ab', '012', '%20'])(
    'rejects a malformed user id: %s',
    (userId) => {
      expect(userIdParamsSchema.safeParse({ userId }).success).toBe(false);
    },
  );

  it('rejects unknown properties', () => {
    expect(
      userIdParamsSchema.safeParse({ userId: '42', extra: 1 }).success,
    ).toBe(false);
  });
});
