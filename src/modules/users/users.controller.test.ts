import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../errors/app-error.js';
import {
  approveAgentController,
  declineAgentController,
  getManageableUsersController,
  getPendingAgentsController,
  suspendUserController,
} from './users.controller.js';
import {
  approveAgent,
  declineAgent,
  getManageableUsers,
  getPendingAgents,
  suspendUser,
} from './users.service.js';
import type { PublicUser } from './user.types.js';

vi.mock('./users.service.js', () => ({
  approveAgent: vi.fn(),
  declineAgent: vi.fn(),
  getManageableUsers: vi.fn(),
  getPendingAgents: vi.fn(),
  reinstateUser: vi.fn(),
  suspendUser: vi.fn(),
}));

const mockedApproveAgent = vi.mocked(approveAgent);
const mockedDeclineAgent = vi.mocked(declineAgent);
const mockedGetManageableUsers = vi.mocked(getManageableUsers);
const mockedGetPendingAgents = vi.mocked(getPendingAgents);
const mockedSuspendUser = vi.mocked(suspendUser);

function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    send: vi.fn(),
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

describe('getManageableUsersController', () => {
  it('returns the users the signed-in admin can manage', async () => {
    const users = [buildPublicUser({ id: '43', accountStatus: 'active' })];
    mockedGetManageableUsers.mockResolvedValueOnce(users);

    const req = {
      auth: { userId: '42', role: 'admin' },
      params: {},
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn();

    await getManageableUsersController(req, res, next);

    expect(mockedGetManageableUsers).toHaveBeenCalledWith('42');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { users } });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards missing authentication to the error middleware', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await getManageableUsersController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(mockedGetManageableUsers).not.toHaveBeenCalled();
  });
});

describe('suspendUserController', () => {
  it('passes the target and acting admin identifiers to the service', async () => {
    const suspendedUser = buildPublicUser({ accountStatus: 'suspended' });
    mockedSuspendUser.mockResolvedValueOnce(suspendedUser);

    const req = {
      auth: { userId: '100', role: 'admin' },
      params: { userId: '42' },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn();

    await suspendUserController(req, res, next);

    expect(mockedSuspendUser).toHaveBeenCalledWith('42', '100');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { user: suspendedUser } });
    expect(next).not.toHaveBeenCalled();
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
      new AppError(
        409,
        'This agent account is not awaiting approval.',
        'AGENT_NOT_PENDING',
      ),
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

describe('declineAgentController', () => {
  it('declines a pending agent request', async () => {
    mockedDeclineAgent.mockResolvedValueOnce(undefined);

    const req = createMockRequest({ userId: '42' });
    const res = createMockResponse();
    const next = vi.fn();

    await declineAgentController(req, res, next);

    expect(mockedDeclineAgent).toHaveBeenCalledWith('42');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards decline errors to the error middleware', async () => {
    mockedDeclineAgent.mockRejectedValueOnce(
      new AppError(
        409,
        'This agent account is not awaiting approval.',
        'AGENT_NOT_PENDING',
      ),
    );

    const req = createMockRequest({ userId: '42' });
    const res = createMockResponse();
    const next = vi.fn();

    await declineAgentController(req, res, next);

    const error = getNextError(next) as AppError;

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('AGENT_NOT_PENDING');
  });
});
