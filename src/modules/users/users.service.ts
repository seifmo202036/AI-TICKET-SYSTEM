import { pool } from '../../db/pool.js';

import { AppError } from '../../errors/app-error.js';

import { revokeAllAuthSessionsForUser } from '../auth/auth-session.repository.js';
import { updateUserAccountStatus } from './user.repository.js';

import type { PublicUser, UserId } from './user.types.js';

export async function suspendUser(userId: UserId): Promise<PublicUser> {
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
