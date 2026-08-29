import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PoolClient } from 'pg';
import type { AiTriageProvider } from '../modules/ai/ai.types.js';

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  findTicketForAiProcessing: vi.fn(),
  markTicketAiProcessing: vi.fn(),
  completeTicketAiTriage: vi.fn(),
  failTicketAiTriage: vi.fn(),
  insertTicketStatusHistory: vi.fn(),
}));

vi.mock('../db/pool.js', () => ({
  pool: { connect: mocks.poolConnect },
}));
vi.mock('../modules/tickets/tickets.repository.js', () => ({
  findTicketForAiProcessing: mocks.findTicketForAiProcessing,
  markTicketAiProcessing: mocks.markTicketAiProcessing,
  completeTicketAiTriage: mocks.completeTicketAiTriage,
  failTicketAiTriage: mocks.failTicketAiTriage,
  insertTicketStatusHistory: mocks.insertTicketStatusHistory,
}));

import { failAiTriageJob, processAiTriageJob } from './ai-triage.worker.js';

function createClient(): PoolClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function buildTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: '42',
    customer_issue_type: 'general',
    description: 'Someone changed my email and password.',
    status: 'triaging',
    ai_status: 'queued',
    deleted_at: null,
    ...overrides,
  };
}

function createProvider(
  result = { category: 'security' as const, priorityScore: 96 },
) {
  return {
    classifyTicket: vi.fn().mockResolvedValue(result),
  } satisfies AiTriageProvider;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processAiTriageJob', () => {
  it.each([
    buildTicket({ ai_status: 'completed' }),
    buildTicket({ ai_status: 'disabled', status: 'open' }),
    buildTicket({ deleted_at: new Date() }),
  ])('skips a ticket that no longer needs AI triage', async (ticket) => {
    mocks.findTicketForAiProcessing.mockResolvedValueOnce(ticket);
    const provider = createProvider();

    await expect(processAiTriageJob('42', provider)).resolves.toBe('skipped');

    expect(mocks.markTicketAiProcessing).not.toHaveBeenCalled();
    expect(provider.classifyTicket).not.toHaveBeenCalled();
  });

  it('completes AI triage and writes the status history in the same transaction', async () => {
    const client = createClient();
    const provider = createProvider();
    mocks.findTicketForAiProcessing.mockResolvedValueOnce(buildTicket());
    mocks.markTicketAiProcessing.mockResolvedValueOnce(
      buildTicket({ ai_status: 'processing' }),
    );
    mocks.poolConnect.mockResolvedValueOnce(client);
    mocks.completeTicketAiTriage.mockResolvedValueOnce(
      buildTicket({ status: 'open', ai_status: 'completed' }),
    );

    await expect(processAiTriageJob('42', provider)).resolves.toBe('completed');

    expect(mocks.completeTicketAiTriage).toHaveBeenCalledWith(
      '42',
      { category: 'security', priorityScore: 96 },
      'critical',
      client,
    );
    expect(mocks.insertTicketStatusHistory).toHaveBeenCalledWith(
      '42',
      null,
      'triaging',
      'open',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('lets BullMQ retry a provider failure', async () => {
    const provider = {
      classifyTicket: vi
        .fn()
        .mockRejectedValue(new Error('Provider unavailable')),
    } satisfies AiTriageProvider;
    mocks.findTicketForAiProcessing.mockResolvedValueOnce(buildTicket());
    mocks.markTicketAiProcessing.mockResolvedValueOnce(
      buildTicket({ ai_status: 'processing' }),
    );

    await expect(processAiTriageJob('42', provider)).rejects.toThrow(
      'Provider unavailable',
    );
    expect(mocks.completeTicketAiTriage).not.toHaveBeenCalled();
  });
});

describe('failAiTriageJob', () => {
  it('opens a ticket and records its final AI failure atomically', async () => {
    const client = createClient();
    mocks.poolConnect.mockResolvedValueOnce(client);
    mocks.failTicketAiTriage.mockResolvedValueOnce(
      buildTicket({ status: 'open', ai_status: 'failed' }),
    );

    await failAiTriageJob('42');

    expect(mocks.failTicketAiTriage).toHaveBeenCalledWith(
      '42',
      'AI triage could not be completed after all retry attempts.',
      client,
    );
    expect(mocks.insertTicketStatusHistory).toHaveBeenCalledWith(
      '42',
      null,
      'triaging',
      'open',
      client,
    );
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
});
