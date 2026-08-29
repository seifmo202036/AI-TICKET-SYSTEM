import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock('../../db/pool.js', () => ({
  pool: { query: poolQuery },
}));

import { getTicketQueue } from './tickets.repository.js';

describe('getTicketQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('orders agent tickets by AI priority while retaining tickets with no AI score', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });

    await getTicketQueue();

    const [query] = poolQuery.mock.calls[0] as [string];
    expect(query).toContain(
      'ORDER BY ai_score DESC NULLS LAST, created_at ASC',
    );
    expect(query).not.toContain('ai_score IS NOT NULL');
  });
});
