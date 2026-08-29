import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { AppError } from '../../errors/app-error.js';
import {
  approveAgent,
  declineAgent,
  getManageableUsers,
  getPendingAgents,
  suspendUser,
} from './users.service.js';
import {
  deletePendingAgent,
  findUserById,
  findManageableUsers,
  findUsersByRoleAndStatus,
  updateUserAccountStatus,
} from './user.repository.js';
import type { PublicUser } from './user.types.js';

vi.mock('./user.repository.js', () => ({
  deletePendingAgent: vi.fn(),
  findUserById: vi.fn(),
  findManageableUsers: vi.fn(),
  findUsersByRoleAndStatus: vi.fn(),
  updateUserAccountStatus: vi.fn(),
}));

const mockedDeletePendingAgent = vi.mocked(deletePendingAgent);
const mockedFindUserById = vi.mocked(findUserById);
const mockedFindManageableUsers = vi.mocked(findManageableUsers);
const mockedFindUsersByRoleAndStatus = vi.mocked(findUsersByRoleAndStatus);
const mockedUpdateUserAccountStatus = vi.mocked(updateUserAccountStatus);

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

beforeEach(() => {
  vi.clearAllMocks();
});

async function getAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }

  throw new Error('Expected the promise to reject');
}

describe('getPendingAgents', () => {
  it('returns agents awaiting approval from the repository', async () => {
    const pendingAgents = [
      buildPublicUser(),
      buildPublicUser({ id: '43', userName: 'agent_two' }),
    ];
    mockedFindUsersByRoleAndStatus.mockResolvedValueOnce(pendingAgents);

    const agents = await getPendingAgents();

    expect(mockedFindUsersByRoleAndStatus).toHaveBeenCalledWith(
      'agent',
      'pending',
    );
    expect(agents).toEqual(pendingAgents);
  });
});

describe('getManageableUsers', () => {
  it('returns the active and suspended users available to an admin', async () => {
    const users = [
      buildPublicUser({ id: '43', accountStatus: 'active' }),
      buildPublicUser({ id: '44', accountStatus: 'suspended' }),
    ];
    mockedFindManageableUsers.mockResolvedValueOnce(users);

    await expect(getManageableUsers('42')).resolves.toEqual(users);

    expect(mockedFindManageableUsers).toHaveBeenCalledWith('42');
  });
});

describe('suspendUser', () => {
  it('rejects self-suspension before changing account status or sessions', async () => {
    const error = await getAppError(suspendUser('42', '42'));

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CANNOT_SUSPEND_SELF');
    expect(mockedUpdateUserAccountStatus).not.toHaveBeenCalled();
  });
});

describe('approveAgent', () => {
  it('activates a pending agent and returns the updated user', async () => {
    const pendingAgent = buildPublicUser();
    const approvedAgent = buildPublicUser({ accountStatus: 'active' });

    mockedFindUserById.mockResolvedValueOnce(pendingAgent);
    mockedUpdateUserAccountStatus.mockResolvedValueOnce(approvedAgent);

    const user = await approveAgent('42');

    expect(mockedFindUserById).toHaveBeenCalledWith('42');
    expect(mockedUpdateUserAccountStatus).toHaveBeenCalledWith('42', 'active');
    expect(user).toBe(approvedAgent);
  });

  it('throws USER_NOT_FOUND when the agent does not exist', async () => {
    mockedFindUserById.mockResolvedValueOnce(null);

    const error = await getAppError(approveAgent('999'));

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('USER_NOT_FOUND');
    expect(mockedUpdateUserAccountStatus).not.toHaveBeenCalled();
  });

  it.each(['customer', 'admin'] as const)(
    'refuses to approve a %s account',
    async (role) => {
      mockedFindUserById.mockResolvedValueOnce(
        buildPublicUser({ role, accountStatus: 'active' }),
      );

      const error = await getAppError(approveAgent('42'));

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('NOT_AN_AGENT');
      expect(mockedUpdateUserAccountStatus).not.toHaveBeenCalled();
    },
  );

  it.each(['active', 'suspended'] as const)(
    'refuses an agent whose status is %s',
    async (accountStatus) => {
      mockedFindUserById.mockResolvedValueOnce(
        buildPublicUser({ accountStatus }),
      );

      const error = await getAppError(approveAgent('42'));

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('AGENT_NOT_PENDING');
      expect(mockedUpdateUserAccountStatus).not.toHaveBeenCalled();
    },
  );
});

describe('declineAgent', () => {
  it('deletes a pending agent request', async () => {
    mockedFindUserById.mockResolvedValueOnce(buildPublicUser());
    mockedDeletePendingAgent.mockResolvedValueOnce(true);

    await expect(declineAgent('42')).resolves.toBeUndefined();

    expect(mockedFindUserById).toHaveBeenCalledWith('42');
    expect(mockedDeletePendingAgent).toHaveBeenCalledWith('42');
  });

  it.each(['customer', 'admin'] as const)(
    'refuses to decline a %s account',
    async (role) => {
      mockedFindUserById.mockResolvedValueOnce(
        buildPublicUser({ role, accountStatus: 'active' }),
      );

      const error = await getAppError(declineAgent('42'));

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('NOT_AN_AGENT');
      expect(mockedDeletePendingAgent).not.toHaveBeenCalled();
    },
  );

  it.each(['active', 'suspended'] as const)(
    'refuses to decline an agent whose status is %s',
    async (accountStatus) => {
      mockedFindUserById.mockResolvedValueOnce(
        buildPublicUser({ accountStatus }),
      );

      const error = await getAppError(declineAgent('42'));

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('AGENT_NOT_PENDING');
      expect(mockedDeletePendingAgent).not.toHaveBeenCalled();
    },
  );
});
