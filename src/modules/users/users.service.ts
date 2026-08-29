import { pool } from '../../db/pool.js';

import { AppError } from '../../errors/app-error.js';

import { revokeAllAuthSessionsForUser } from '../auth/auth-session.repository.js';
import {
  deletePendingAgent,
  findUserById,
  findManageableUsers,
  findUsersByRoleAndStatus,
  updateUserAccountStatus,
} from './user.repository.js';

import type { PublicUser, UserId } from './user.types.js';

export async function suspendUser(
  userId: UserId,
  actingAdminUserId: UserId,
): Promise<PublicUser> {
  if (userId === actingAdminUserId) {
    throw new AppError(
      409,
      'You cannot suspend your own account.',
      'CANNOT_SUSPEND_SELF',
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const suspendedUser = await updateUserAccountStatus(
      userId,
      'suspended',
      client,
    );

    if (!suspendedUser) {
      throw new AppError(
        404,
        'The user to suspend was not found.',
        'USER_NOT_FOUND',
      );
    }

    // Suspension must take effect immediately: every live refresh token for
    // this user is revoked in the same transaction as the status change.
    await revokeAllAuthSessionsForUser(userId, client);

    await client.query('COMMIT');

    return suspendedUser;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back user suspension:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function reinstateUser(userId: UserId): Promise<PublicUser> {
  const reinstatedUser = await updateUserAccountStatus(userId, 'active');

  if (!reinstatedUser) {
    throw new AppError(
      404,
      'The user to reinstate was not found.',
      'USER_NOT_FOUND',
    );
  }

  return reinstatedUser;
}

export async function getPendingAgents(): Promise<PublicUser[]> {
  return findUsersByRoleAndStatus('agent', 'pending');
}

export async function getManageableUsers(
  actingAdminUserId: UserId,
): Promise<PublicUser[]> {
  return findManageableUsers(actingAdminUserId);
}

export async function approveAgent(userId: UserId): Promise<PublicUser> {
  // Agents sign up as pending and must be approved by an admin before login.
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      404,
      'The agent to approve was not found.',
      'USER_NOT_FOUND',
    );
  }

  if (user.role !== 'agent') {
    throw new AppError(
      409,
      'Only agent accounts can be approved.',
      'NOT_AN_AGENT',
    );
  }

  if (user.accountStatus !== 'pending') {
    throw new AppError(
      409,
      'This agent account is not awaiting approval.',
      'AGENT_NOT_PENDING',
    );
  }

  const approvedAgent = await updateUserAccountStatus(userId, 'active');

  if (!approvedAgent) {
    throw new AppError(
      404,
      'The agent to approve was not found.',
      'USER_NOT_FOUND',
    );
  }

  return approvedAgent;
}

export async function declineAgent(userId: UserId): Promise<void> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(
      404,
      'The agent to decline was not found.',
      'USER_NOT_FOUND',
    );
  }

  if (user.role !== 'agent') {
    throw new AppError(
      409,
      'Only agent accounts can be declined.',
      'NOT_AN_AGENT',
    );
  }

  if (user.accountStatus !== 'pending') {
    throw new AppError(
      409,
      'This agent account is not awaiting approval.',
      'AGENT_NOT_PENDING',
    );
  }

  const wasDeleted = await deletePendingAgent(userId);

  if (!wasDeleted) {
    throw new AppError(
      404,
      'The agent to decline was not found.',
      'USER_NOT_FOUND',
    );
  }
}
