import type {
  PoolClient,
} from "pg";

import { pool } from "../../db/pool.js";

import type {
  AuthSession,
  CreateAuthSessionInput,
} from './auth-session.types.js';
import type { UserId } from '../users/user.types.js';

type AuthSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
  created_at: Date;
};


function mapAuthSessionRow(
  row: AuthSessionRow,
): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBySessionId:
      row.replaced_by_session_id,
    createdAt: row.created_at,
  };
}

export async function createAuthSession(
  data: CreateAuthSessionInput,
  client?: PoolClient,
): Promise<AuthSession> {
  const database = client ?? pool;

  const result =
    await database.query<AuthSessionRow>(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
      `,
      [
        data.id,
        data.userId,
        data.refreshTokenHash,
        data.expiresAt,
      ],
    );

  const session = result.rows[0];

  if (!session) {
    throw new Error(
      "Unable to create an authentication session. Please try signing in again.",
    );
  }

  return mapAuthSessionRow(session);
}

export async function findAuthSessionByRefreshTokenHash(
  refreshTokenHash: string,
): Promise<AuthSession | null> {
  const result =
    await pool.query<AuthSessionRow>(
      `
        SELECT
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [refreshTokenHash],
    );

  const session = result.rows[0];

  return session
    ? mapAuthSessionRow(session)
    : null;
}
export async function findAuthSessionByRefreshTokenHashForUpdate(
  client: PoolClient,
  refreshTokenHash: string,
): Promise<AuthSession | null> {
  const result =
    await client.query<AuthSessionRow>(
      `
        SELECT
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
        FROM auth_sessions
        WHERE token_hash = $1
        FOR UPDATE
      `,
      [refreshTokenHash],
    );

  const session = result.rows[0];

  return session
    ? mapAuthSessionRow(session)
    : null;
}


export async function revokeAuthSessionByRefreshTokenHash(
  refreshTokenHash: string,
): Promise<void> {
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [refreshTokenHash],
  );
}

export async function revokeAllAuthSessionsForUser(
  userId: UserId,
): Promise<void> {
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
  );
}

export async function revokeAndReplaceAuthSession(
  client: PoolClient,
  oldSessionId: string,
  replacementSessionId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE auth_sessions
      SET
        revoked_at = NOW(),
        replaced_by_session_id = $2
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [
      oldSessionId,
      replacementSessionId,
    ],
  );
}
