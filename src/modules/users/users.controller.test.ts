import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  approveAgentController,
  getPendingAgentsController,
} from './users.controller.js';
import { approveAgent, getPendingAgents } from './users.service.js';
import type { PublicUser } from './user.types.js';

vi.mock('./users.service.js', () => ({
  approveAgent: vi.fn(),
  getPendingAgents: vi.fn(),
  reinstateUser: vi.fn(),
  suspendUser: vi.fn(),
}));

const mockedApproveAgent = vi.mocked(approveAgent);
const mockedGetPendingAgents = vi.mocked(getPendingAgents);

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

function createMockRequest(params: Record<string, string> = {}) {
  return { params } as Request;
}

function buildPublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: '42',
    userName: 'agent_seif',
    email: 'agent@example.com',
    role: 'agent',
    accountStatus: 'pending',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function getNextError(next: NextFunction): unknown {
  expect(next).toHaveBeenCalledTimes(1);

  return vi.mocked(next).mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPendingAgentsController', () => {
  it('responds with the pending agents', async () => {
    const pendingAgents = [
      buildPublicUser(),
      buildPublicUser({ id: '43' }),
    ] as PublicUser[];
    mockedGetPendingAgents.mockResolvedValueOnce(pendingAgents);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getPendingAgentsController(req, res, next);

    expect(mockedGetPendingAgents).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { agents: pendingAgents } });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards repository errors to the error middleware', async () => {
    mockedGetPendingAgents.mockRejectedValueOnce(
      new AppError(500, 'Unable to list the users.', 'DATABASE_QUERY_FAILED'),
    );

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getPendingAgentsController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.code).toBe('DATABASE_QUERY_FAILED');
  });
});

describe('approveAgentController', () => {
  it('approves a pending agent and responds with the updated user', async () => {
    const approvedAgent = buildPublicUser({ accountStatus: 'active' });
    mockedApproveAgent.mockResolvedValueOnce(approvedAgent);

    const req = createMockRequest({ userId: '42' });
    const res = createMockResponse();
    const next = vi.fn();

    await approveAgentController(req, res, next);

    expect(mockedApproveAgent).toHaveBeenCalledWith('42');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { user: approvedAgent } });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['abc', '', '0', '-1', '1.5', '12ab'])(
    'responds with 400 INVALID_USER_ID for user id: %s',
    async (userId) => {
      const req = createMockRequest({ userId });
      const res = createMockResponse();
      const next = vi.fn();

      await approveAgentController(req, res, next);

      const error = getNextError(next) as AppError;

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_USER_ID');
      expect(mockedApproveAgent).not.toHaveBeenCalled();
    },
  );

  it('forwards service errors to the error middleware', async () => {
    mockedApproveAgent.mockRejectedValueOnce(
      new AppError(409, 'This agent account is not awaiting approval.', 'AGENT_NOT_PENDING'),
    );

    const req = createMockRequest({ userId: '42' });
    const res = createMockResponse();
    const next = vi.fn();

    await approveAgentController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('AGENT_NOT_PENDING');
  });
});
